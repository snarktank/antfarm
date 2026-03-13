import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

test('vps-dashboard authentication security', async (t) => {
  const serverPath = path.join(process.cwd(), '..', 'vps-dashboard', 'src', 'server.js');
  
  if (!fs.existsSync(serverPath)) {
    console.log('vps-dashboard not found, skipping test');
    return;
  }
  
  const content = fs.readFileSync(serverPath, 'utf8');
  
  await t.test('should not contain hardcoded default password', () => {
    assert.ok(!content.includes("'jimmy2024'"), 'Hardcoded password jimmy2024 found');
    assert.ok(!content.includes('"jimmy2024"'), 'Hardcoded password jimmy2024 found');
  });
  
  await t.test('should not contain weak session secret', () => {
    assert.ok(!content.includes("'vps-secret-key'"), 'Weak session secret found');
    assert.ok(!content.includes('"vps-secret-key"'), 'Weak session secret found');
  });
  
  await t.test('should require DASHBOARD_PASSWORD env var', () => {
    assert.ok(content.includes('DASHBOARD_PASSWORD'), 'Missing DASHBOARD_PASSWORD check');
    assert.ok(content.includes('process.exit(1)'), 'Missing startup validation');
  });
  
  await t.test('should require SESSION_SECRET env var', () => {
    assert.ok(content.includes('SESSION_SECRET'), 'Missing SESSION_SECRET check');
    assert.ok(content.includes('length < 32'), 'Missing SESSION_SECRET length validation');
  });
  
  await t.test('should have secure cookie configuration', () => {
    assert.ok(content.includes('httpOnly: true'), 'Missing httpOnly cookie flag');
    assert.ok(content.includes('secure:'), 'Missing secure cookie configuration');
    assert.ok(content.includes('NODE_ENV'), 'Missing production check for secure cookies');
  });
});
