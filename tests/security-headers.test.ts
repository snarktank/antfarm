import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

test('vps-dashboard uses helmet middleware', () => {
  const serverPath = path.join(process.cwd(), '..', 'vps-dashboard', 'src', 'server.js');
  const content = fs.readFileSync(serverPath, 'utf8');
  
  assert.ok(content.includes("require('helmet')"), 'helmet must be required');
  assert.ok(content.includes('app.use(helmet('), 'helmet middleware must be used');
  assert.ok(content.includes('contentSecurityPolicy'), 'CSP must be configured');
});

test('automation-hub uses helmet middleware', () => {
  const serverPath = path.join(process.cwd(), '..', 'automation-hub', 'server.js');
  const content = fs.readFileSync(serverPath, 'utf8');
  
  assert.ok(content.includes("require('helmet')"), 'helmet must be required');
  assert.ok(content.includes('app.use(helmet('), 'helmet middleware must be used');
  assert.ok(content.includes('contentSecurityPolicy'), 'CSP must be configured');
});
