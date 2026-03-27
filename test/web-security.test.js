import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getConfig, validateConfig } from '../src/config.js';
import { fetchAllowedUrl, startServer } from '../src/server.js';
import { createSessionCookie, decodeSessionValue, encodeSessionValue, isSecureRequest, sessionPolicy, shouldRotateSession } from '../src/session.js';

const execFileAsync = promisify(execFile);

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

async function issueSessionCookie(baseUrl) {
  const response = await fetch(`${baseUrl}/session`);
  const cookieHeader = response.headers.get('set-cookie');
  assert.ok(cookieHeader, 'expected session cookie to be issued');
  return cookieHeader.split(';', 1)[0];
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

test('should reject cross-site forged POST requests on cookie-authenticated state-changing routes', async () => {
  await withServer(async (baseUrl) => {
    const sessionCookie = await issueSessionCookie(baseUrl);

    const forgedRun = await fetch(`${baseUrl}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        origin: 'https://evil.example'
      },
      body: JSON.stringify({ cmd: '' })
    });
    assert.equal(forgedRun.status, 403);
    assert.deepEqual(await forgedRun.json(), { error: 'CSRF validation failed' });

    const sameOriginRun = await fetch(`${baseUrl}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        origin: baseUrl
      },
      body: JSON.stringify({ cmd: '' })
    });
    assert.equal(sameOriginRun.status, 200);

    const forgedDelete = await fetch(`${baseUrl}/admin/delete-user`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        origin: 'https://evil.example',
        'x-authenticated-user': 'root-admin',
        'x-user-role': 'admin'
      },
      body: JSON.stringify({ userId: 'victim-4' })
    });
    assert.equal(forgedDelete.status, 403);
    assert.deepEqual(await forgedDelete.json(), { error: 'CSRF validation failed' });

    const sameOriginDeserialize = await fetch(`${baseUrl}/deserialize`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        referer: `${baseUrl}/form`
      },
      body: JSON.stringify({
        payload: '{"type":"note","value":"safe text"}'
      })
    });
    assert.equal(sameOriginDeserialize.status, 200);
    assert.deepEqual(await sameOriginDeserialize.json(), {
      ok: true,
      obj: {
        type: 'note',
        value: 'safe text'
      }
    });

    const missingSource = await fetch(`${baseUrl}/deserialize`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie
      },
      body: JSON.stringify({
        payload: '{"type":"note","value":"safe text"}'
      })
    });
    assert.equal(missingSource.status, 403);
    assert.deepEqual(await missingSource.json(), { error: 'CSRF validation failed' });
  });
});

test('should reject SQL injection in user lookup and return only bound-parameter matches', async () => {
  await withServer(async (baseUrl) => {
    const safe = await fetch(`${baseUrl}/user?id=1`);
    assert.equal(safe.status, 200);
    assert.deepEqual(await safe.json(), [{ id: 1, name: 'Alice' }]);

    const injected = await fetch(`${baseUrl}/user?id=${encodeURIComponent('1 OR 1=1')}`);
    assert.equal(injected.status, 400);
    assert.deepEqual(await injected.json(), { error: 'id must be a numeric identifier' });

    const unionPayload = await fetch(`${baseUrl}/user?id=${encodeURIComponent('1 UNION SELECT 99,sqlite_version()')}`);
    assert.equal(unionPayload.status, 400);
    assert.deepEqual(await unionPayload.json(), { error: 'id must be a numeric identifier' });
  });
});

test('should HTML-encode reflected search input so script payloads render as inert text', async () => {
  await withServer(async (baseUrl) => {
    const payload = '<script>alert("owned")</script>';
    const response = await fetch(`${baseUrl}/search?q=${encodeURIComponent(payload)}`);

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^text\/html/);

    const body = await response.text();
    assert.equal(body, '<h1>Results for: &lt;script&gt;alert(&quot;owned&quot;)&lt;/script&gt;</h1>');
    assert.doesNotMatch(body, /<script>/i);
  });
});

test('should reject code-execution payloads in deserialize and accept only schema-valid JSON', async () => {
  const markerFile = '/tmp/antfarm-deserialize-owned';
  fs.rmSync(markerFile, { force: true });

  await withServer(async (baseUrl) => {
    const malicious = await fetch(`${baseUrl}/deserialize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        payload: '{"type":"note","value":this.constructor.constructor("return process")().mainModule.require("fs").writeFileSync("/tmp/antfarm-deserialize-owned","owned")}'
      })
    });
    assert.equal(malicious.status, 400);
    assert.deepEqual(await malicious.json(), { error: 'Invalid payload' });
    assert.equal(fs.existsSync(markerFile), false);

    const invalidSchema = await fetch(`${baseUrl}/deserialize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        payload: '{"type":"","extra":"field"}'
      })
    });
    assert.equal(invalidSchema.status, 400);
    assert.deepEqual(await invalidSchema.json(), { error: 'Invalid payload' });

    const safe = await fetch(`${baseUrl}/deserialize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        payload: '{"type":"note","value":"safe text"}'
      })
    });
    assert.equal(safe.status, 200);
    assert.deepEqual(await safe.json(), {
      ok: true,
      obj: {
        type: 'note',
        value: 'safe text'
      }
    });
  });
});

test('should read required secrets from environment instead of hardcoded source values', () => {
  const missing = validateConfig({ API_KEY: 'api', ADMIN_PASSWORD: '', JWT_SECRET: 'jwt' });
  assert.deepEqual(missing, ['ADMIN_PASSWORD']);

  const originalEnv = {
    API_KEY: process.env.API_KEY,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    JWT_SECRET: process.env.JWT_SECRET
  };

  process.env.API_KEY = 'rotated-api-key';
  process.env.ADMIN_PASSWORD = 'rotated-admin-password';
  process.env.JWT_SECRET = 'rotated-jwt-secret';

  try {
    assert.deepEqual(getConfig(), {
      apiKey: 'rotated-api-key',
      adminPassword: 'rotated-admin-password',
      jwtSecret: 'rotated-jwt-secret'
    });
  } finally {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (typeof value === 'undefined') {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test('should not expose runtime environment details from debug endpoint', async () => {
  process.env.DEBUG_SECRET = 'debug-secret-value';

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/debug`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: 'Not found' });
    });
  } finally {
    delete process.env.DEBUG_SECRET;
  }
});

test('should redact JWT secret values from log output', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'log-redaction-fixture-'));
  const logPath = path.join(fixtureRoot, 'app.log');

  try {
    await execFileAsync('sh', [path.resolve('src/write-log.sh')], {
      cwd: fixtureRoot,
      env: {
        ...process.env,
        JWT_SECRET: 'jwt-super-secret-value'
      }
    });

    const logContents = fs.readFileSync(logPath, 'utf8');
    assert.equal(logContents, 'token=[redacted]\n');
    assert.doesNotMatch(logContents, /jwt-super-secret-value/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('should reject SSRF targets and redirect chains that resolve to internal addresses', async () => {
  await assert.rejects(
    () => fetchAllowedUrl('http://127.0.0.1/private'),
    /URL not allowed/
  );

  const lookup = async (hostname) => {
    if (hostname === 'example.com') {
      return [{ address: '93.184.216.34', family: 4 }];
    }

    if (hostname === '169.254.169.254.nip.io') {
      return [{ address: '169.254.169.254', family: 4 }];
    }

    throw new Error(`Unexpected hostname lookup: ${hostname}`);
  };

  let fetchCalls = 0;
  await assert.rejects(
    () => fetchAllowedUrl('https://example.com/redirect', {
      lookup,
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response(null, {
          status: 302,
          headers: {
            location: 'https://169.254.169.254.nip.io/latest/meta-data/'
          }
        });
      }
    }),
    /URL not allowed/
  );

  assert.equal(fetchCalls, 1);
});

test('should harden session cookies in the live request path and rotate sessions before expiry', async () => {
  const productionCookie = createSessionCookie({ isSecureContext: true });
  assert.equal(productionCookie.httpOnly, true);
  assert.equal(productionCookie.secure, true);
  assert.equal(productionCookie.sameSite, 'lax');
  assert.equal(productionCookie.maxAge, 15 * 60 * 1000);

  const developmentCookie = createSessionCookie({ isSecureContext: false });
  assert.equal(developmentCookie.httpOnly, true);
  assert.equal(developmentCookie.secure, false);
  assert.equal(developmentCookie.sameSite, 'lax');
  assert.equal(developmentCookie.maxAge, 15 * 60 * 1000);

  assert.equal(isSecureRequest({ secure: true, get: () => null, headers: {} }), true);
  assert.equal(isSecureRequest({ secure: false, get: (name) => (name === 'x-forwarded-proto' ? 'https' : null), headers: {} }), true);
  assert.equal(isSecureRequest({ secure: false, get: () => null, headers: {} }), false);

  assert.equal(shouldRotateSession({ issuedAt: 1_000, now: 1_000 + sessionPolicy.renewalWindowMs - 1 }), false);
  assert.equal(shouldRotateSession({ issuedAt: 1_000, now: 1_000 + sessionPolicy.renewalWindowMs }), true);
  assert.equal(shouldRotateSession({ issuedAt: Number.NaN, now: 1_000 }), true);

  await withServer(async (baseUrl) => {
    const tlsResponse = await fetch(`${baseUrl}/session`, {
      headers: {
        'x-forwarded-proto': 'https'
      }
    });

    assert.equal(tlsResponse.status, 200);
    const tlsCookieHeader = tlsResponse.headers.get('set-cookie') ?? '';
    assert.match(tlsCookieHeader, /sid=/);
    assert.match(tlsCookieHeader, /HttpOnly/i);
    assert.match(tlsCookieHeader, /Secure/i);
    assert.match(tlsCookieHeader, /SameSite=Lax/i);
    assert.match(tlsCookieHeader, /Max-Age=900/i);

    const insecureResponse = await fetch(`${baseUrl}/session`);
    const insecureCookieHeader = insecureResponse.headers.get('set-cookie') ?? '';
    assert.match(insecureCookieHeader, /sid=/);
    assert.match(insecureCookieHeader, /HttpOnly/i);
    assert.doesNotMatch(insecureCookieHeader, /Secure/i);
    assert.match(insecureCookieHeader, /SameSite=Lax/i);

    const staleSessionCookie = encodeSessionValue({
      issuedAt: Date.now() - sessionPolicy.renewalWindowMs - 1_000
    });
    const rotatedResponse = await fetch(`${baseUrl}/session`, {
      headers: {
        cookie: `sid=${staleSessionCookie}`
      }
    });
    const rotatedCookieHeader = rotatedResponse.headers.get('set-cookie') ?? '';
    assert.match(rotatedCookieHeader, /sid=/);
    const rotatedValue = /sid=([^;]+)/.exec(rotatedCookieHeader)?.[1] ?? '';
    const decodedRotatedSession = decodeSessionValue(rotatedValue);
    assert.ok(decodedRotatedSession);
    assert.ok(decodedRotatedSession.issuedAt > Date.now() - sessionPolicy.renewalWindowMs);
  });

  const sessionPolicyDoc = fs.readFileSync(path.resolve('docs/session-cookie-policy.md'), 'utf8');
  assert.match(sessionPolicyDoc, /SameSite=Lax/);
  assert.match(sessionPolicyDoc, /X-Forwarded-Proto: https/);
  assert.match(sessionPolicyDoc, /Max-Age=900/);
});

test('should pin patched dependency versions and enforce a high-severity audit gate in CI', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  assert.equal(packageJson.dependencies.express, '^4.22.1');
  assert.equal(packageJson.dependencies.lodash, '^4.17.23');
  assert.equal(packageJson.dependencies.minimist, '^1.2.8');
  assert.equal(packageJson.dependencies.sqlite3, '^6.0.1');
  assert.equal(packageJson.scripts['audit:dependencies'], 'npm audit --audit-level=high');

  const ciWorkflow = fs.readFileSync(path.resolve('.github/workflows/ci.yml'), 'utf8');
  assert.match(ciWorkflow, /run: npm ci/);
  assert.match(ciWorkflow, /run: npm run build/);
  assert.match(ciWorkflow, /run: npm test/);
  assert.match(ciWorkflow, /run: npm run audit:dependencies/);
});
