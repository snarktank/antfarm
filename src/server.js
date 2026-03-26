import express from 'express';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';

const app = express();
const db = new sqlite3.Database(':memory:');

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/user', (req, res) => {
  const id = req.query.id;
  const sql = `SELECT * FROM users WHERE id = ${id}`;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/search', (req, res) => {
  const q = req.query.q || '';
  res.send(`<h1>Results for: ${q}</h1>`);
});

app.post('/run', (req, res) => {
  const cmd = req.body.cmd;
  exec(`ls ${cmd}`, (err, stdout, stderr) => {
    res.json({ err: err?.message, stdout, stderr });
  });
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

app.post('/admin/delete-user', (req, res) => {
  const userId = req.body.userId;
  res.json({ deleted: userId, by: 'unauthenticated-user' });
});

app.get('/fetch', async (req, res) => {
  const url = req.query.url;
  const r = await fetch(url);
  const text = await r.text();
  res.send(text.slice(0, 200));
});

app.post('/deserialize', (req, res) => {
  const obj = eval('(' + req.body.payload + ')');
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
