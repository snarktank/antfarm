import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { startServer } from '../src/server.js';

async function withServer(run) {
  const server = startServer(0);
  await once(server, 'listening');

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await run(baseUrl);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('should reject directory traversal in download and serve only data files', async () => {
  const originalCwd = process.cwd();
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'download-fixture-'));
  const dataDir = path.join(fixtureRoot, 'data');
  const siblingSecret = path.join(fixtureRoot, 'secret.txt');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'hello.txt'), 'safe fixture data');
  fs.writeFileSync(siblingSecret, 'top-secret');
  process.chdir(fixtureRoot);

  try {
    await withServer(async (baseUrl) => {
      const allowed = await fetch(`${baseUrl}/download?file=${encodeURIComponent('hello.txt')}`);
      assert.equal(allowed.status, 200);
      assert.equal(await allowed.text(), 'safe fixture data');

      const traversal = await fetch(`${baseUrl}/download?file=${encodeURIComponent('../secret.txt')}`);
      assert.equal(traversal.status, 400);
      assert.deepEqual(await traversal.json(), { error: 'Invalid file path' });

      const nestedTraversal = await fetch(`${baseUrl}/download?file=${encodeURIComponent('nested/../../secret.txt')}`);
      assert.equal(nestedTraversal.status, 400);
      assert.deepEqual(await nestedTraversal.json(), { error: 'Invalid file path' });

      const encodedTraversal = await fetch(`${baseUrl}/download?file=..%2Fsecret.txt`);
      assert.equal(encodedTraversal.status, 400);
      assert.deepEqual(await encodedTraversal.json(), { error: 'Invalid file path' });

      const nullBytePayload = await fetch(`${baseUrl}/download?file=${encodeURIComponent('hello.txt\0')}`);
      assert.equal(nullBytePayload.status, 400);
      assert.deepEqual(await nullBytePayload.json(), { error: 'Invalid file path' });
    });
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
