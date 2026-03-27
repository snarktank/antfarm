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

test('should reject command injection payloads in run endpoint', async () => {
  await withServer(async (baseUrl) => {
    const safe = await fetch(`${baseUrl}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cmd: '' })
    });
    assert.equal(safe.status, 200);
    const safeBody = await safe.json();
    assert.equal(safeBody.err, null);
    assert.equal(safeBody.stderr, '');
    assert.match(safeBody.stdout, /src/);

    const injected = await fetch(`${baseUrl}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cmd: '; touch /tmp/antfarm-owned' })
    });
    assert.equal(injected.status, 400);
    assert.deepEqual(await injected.json(), { error: 'Unsafe command input' });
    assert.equal(fs.existsSync('/tmp/antfarm-owned'), false);

    const subshell = await fetch(`${baseUrl}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cmd: '$(touch /tmp/antfarm-owned-2)' })
    });
    assert.equal(subshell.status, 400);
    assert.deepEqual(await subshell.json(), { error: 'Unsafe command input' });
    assert.equal(fs.existsSync('/tmp/antfarm-owned-2'), false);
  });
});

test('should require authentication and admin role for admin delete', async () => {
  await withServer(async (baseUrl) => {
    const unauthenticated = await fetch(`${baseUrl}/admin/delete-user`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'victim-1' })
    });
    assert.equal(unauthenticated.status, 401);
    assert.deepEqual(await unauthenticated.json(), { error: 'Authentication required' });

    const nonAdmin = await fetch(`${baseUrl}/admin/delete-user`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-authenticated-user': 'alice',
        'x-user-role': 'user'
      },
      body: JSON.stringify({ userId: 'victim-2' })
    });
    assert.equal(nonAdmin.status, 403);
    assert.deepEqual(await nonAdmin.json(), { error: 'Admin role required' });

    const admin = await fetch(`${baseUrl}/admin/delete-user`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-authenticated-user': 'root-admin',
        'x-user-role': 'ADMIN'
      },
      body: JSON.stringify({ userId: 'victim-3' })
    });
    assert.equal(admin.status, 200);
    assert.deepEqual(await admin.json(), { deleted: 'victim-3', by: 'root-admin' });
  });
});
