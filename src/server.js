import express from 'express';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import sqlite3 from 'sqlite3';

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
  const target = path.join(process.cwd(), 'data', file);
  const content = fs.readFileSync(target, 'utf8');
  res.type('text/plain').send(content);
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

app.listen(3000);
