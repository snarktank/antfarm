import escapeHtml from 'escape-html';
import express from 'express';
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { promises as dns } from 'node:dns';
import net from 'node:net';
import { fileURLToPath } from 'url';

export const app = express();
const db = new sqlite3.Database(':memory:');

db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
  db.run('INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)', [1, 'Alice']);
  db.run('INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)', [2, 'Bob']);
});

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/user', (req, res) => {
  const id = req.query.id;

  if (typeof id !== 'string' || !/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'id must be a numeric identifier' });
  }

  const sql = 'SELECT * FROM users WHERE id = ?';
  db.all(sql, [Number.parseInt(id, 10)], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/search', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const escapedQuery = escapeHtml(q);
  res.type('html').send(`<h1>Results for: ${escapedQuery}</h1>`);
});

const SAFE_RUN_ARGUMENTS = new Set(['', '.', './data', 'data']);
const UNSAFE_RUN_PATTERN = /[;&|`$()<>\\\n\r]/;

app.post('/run', (req, res) => {
  const cmd = req.body?.cmd;

  if (typeof cmd !== 'string') {
    return res.status(400).json({ error: 'cmd must be a string' });
  }

  const normalizedCmd = cmd.trim();

  if (UNSAFE_RUN_PATTERN.test(normalizedCmd)) {
    return res.status(400).json({ error: 'Unsafe command input' });
  }

  if (!SAFE_RUN_ARGUMENTS.has(normalizedCmd)) {
    return res.status(400).json({ error: 'Unsupported ls target' });
  }

  const targetDirectory = normalizedCmd === '' ? '.' : normalizedCmd;

  try {
    const stdout = fs.readdirSync(targetDirectory).join('\n');
    res.json({ err: null, stdout, stderr: '' });
  } catch (error) {
    res.status(error.code === 'ENOENT' ? 400 : 500).json({
      err: error.message,
      stdout: '',
      stderr: ''
    });
  }
});

app.get('/download', (req, res) => {
  const file = req.query.file;

  if (typeof file !== 'string' || file.trim() === '') {
    return res.status(400).json({ error: 'A valid file is required' });
  }

  if (file.includes('\0') || file.includes('..')) {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  const dataDirectory = path.resolve(process.cwd(), 'data');
  const normalizedFile = path.normalize(file).replace(/^([/\\])+/, '');
  const target = path.resolve(dataDirectory, normalizedFile);
  const relativeTarget = path.relative(dataDirectory, target);

  if (
    normalizedFile === '' ||
    relativeTarget.startsWith('..') ||
    path.isAbsolute(relativeTarget)
  ) {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  try {
    const content = fs.readFileSync(target, 'utf8');
    res.type('text/plain').send(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found' });
    }

    return res.status(500).json({ error: 'Unable to read file' });
  }
});

function requireAuthenticatedUser(req, res, next) {
  const username = req.get('x-authenticated-user');

  if (typeof username !== 'string' || username.trim() === '') {
    return res.status(401).json({ error: 'Authentication required' });
  }

  req.user = {
    name: username.trim(),
    role: typeof req.get('x-user-role') === 'string' ? req.get('x-user-role').trim().toLowerCase() : ''
  };

  next();
}

function requireAdminRole(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }

  next();
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ALLOWED_FETCH_PROTOCOLS = new Set(['https:']);
const ALLOWED_FETCH_HOSTNAMES = new Set(['example.com', 'www.example.com']);
const FETCH_TIMEOUT_MS = 3_000;
const MAX_FETCH_REDIRECTS = 3;

function isBlockedIpv4(ip) {
  const octets = ip.split('.').map((part) => Number.parseInt(part, 10));

  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true;
  }

  return (
    octets[0] === 0 ||
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function normalizeIp(ip) {
  if (typeof ip !== 'string') {
    return '';
  }

  const mappedIpv4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mappedIpv4) {
    return mappedIpv4[1];
  }

  return ip.toLowerCase();
}

function isBlockedIp(ip) {
  const normalizedIp = normalizeIp(ip);
  const family = net.isIP(normalizedIp);

  if (family === 4) {
    return isBlockedIpv4(normalizedIp);
  }

  if (family === 6) {
    return normalizedIp === '::1' || normalizedIp.startsWith('fc') || normalizedIp.startsWith('fd') || normalizedIp.startsWith('fe8') || normalizedIp.startsWith('fe9') || normalizedIp.startsWith('fea') || normalizedIp.startsWith('feb');
  }

  return true;
}

async function assertUrlIsAllowed(candidateUrl, lookup = dns.lookup) {
  let parsedUrl;

  try {
    parsedUrl = new URL(candidateUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!ALLOWED_FETCH_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new Error('URL not allowed');
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('URL not allowed');
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  if (!ALLOWED_FETCH_HOSTNAMES.has(hostname) || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('URL not allowed');
  }

  const directIpFamily = net.isIP(hostname);
  if (directIpFamily !== 0) {
    if (isBlockedIp(hostname)) {
      throw new Error('URL not allowed');
    }

    return parsedUrl;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error('URL not allowed');
  }

  if (addresses.some((entry) => isBlockedIp(entry.address))) {
    throw new Error('URL not allowed');
  }

  return parsedUrl;
}

async function fetchAllowedUrl(url, { fetchImpl = fetch, lookup = dns.lookup } = {}) {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= MAX_FETCH_REDIRECTS; redirectCount += 1) {
    const validatedUrl = await assertUrlIsAllowed(currentUrl, lookup);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetchImpl(validatedUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');

        if (!location) {
          throw new Error('Invalid redirect');
        }

        currentUrl = new URL(location, validatedUrl).toString();
        continue;
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('Too many redirects');
}

function isValidDeserializedObject(value) {
  if (!isPlainObject(value)) {
    return false;
  }

  const keys = Object.keys(value);

  if (keys.length !== 2 || !keys.includes('type') || !keys.includes('value')) {
    return false;
  }

  if (typeof value.type !== 'string' || value.type.trim() === '') {
    return false;
  }

  return ['string', 'number', 'boolean'].includes(typeof value.value) || value.value === null;
}

app.post('/admin/delete-user', requireAuthenticatedUser, requireAdminRole, (req, res) => {
  const userId = req.body.userId;
  res.json({ deleted: userId, by: req.user.name });
});

app.get('/fetch', async (req, res) => {
  const url = req.query.url;

  if (typeof url !== 'string' || url.trim() === '') {
    return res.status(400).json({ error: 'A valid URL is required' });
  }

  try {
    const response = await fetchAllowedUrl(url);
    const text = await response.text();
    return res.send(text.slice(0, 200));
  } catch (error) {
    return res.status(400).json({ error: error.name === 'AbortError' ? 'Upstream request timed out' : error.message });
  }
});

app.post('/deserialize', (req, res) => {
  if (typeof req.body?.payload !== 'string') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  let obj;

  try {
    obj = JSON.parse(req.body.payload);
  } catch {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  if (!isValidDeserializedObject(obj)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  res.json({ ok: true, obj });
});

app.get('/debug', (req, res) => {
  res.json({ env: process.env, cwd: process.cwd() });
});

export { assertUrlIsAllowed, fetchAllowedUrl };

export function startServer(port = 3000) {
  return app.listen(port);
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntrypoint) {
  startServer(3000);
}
