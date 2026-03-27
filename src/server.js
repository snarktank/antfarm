import express from 'express';
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
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
  const q = req.query.q || '';
  res.send(`<h1>Results for: ${q}</h1>`);
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
  const r = await fetch(url);
  const text = await r.text();
  res.send(text.slice(0, 200));
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

export function startServer(port = 3000) {
  return app.listen(port);
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntrypoint) {
  startServer(3000);
}
