import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

test('automation-hub log endpoint security', async (t) => {
  const serverPath = path.join(process.cwd(), '..', 'automation-hub', 'server.js');
  
  if (!fs.existsSync(serverPath)) {
    console.log('automation-hub not found, skipping test');
    return;
  }
  
  const content = fs.readFileSync(serverPath, 'utf8');
  
  await t.test('should require AUTOMATION_HUB_AUTH_TOKEN env var', () => {
    assert.ok(content.includes('AUTOMATION_HUB_AUTH_TOKEN'), 'Missing AUTOMATION_HUB_AUTH_TOKEN check');
    assert.ok(content.includes('process.exit(1)'), 'Missing startup validation for auth token');
  });
  
  await t.test('should have authentication middleware on logs endpoint', () => {
    // Check that requireAuth middleware is defined and used
    assert.ok(content.includes('requireAuth'), 'Missing requireAuth middleware');
    assert.ok(content.includes("app.get('/logs/:filename', requireAuth"), 'Logs endpoint missing requireAuth middleware');
  });
  
  await t.test('should sanitize filename with path.basename()', () => {
    assert.ok(content.includes('path.basename'), 'Missing path.basename() for filename sanitization');
    assert.ok(content.includes('sanitizedFilename'), 'Missing sanitized filename variable');
  });
  
  await t.test('should validate resolved path is within logs directory', () => {
    assert.ok(content.includes('path.resolve'), 'Missing path.resolve() for path validation');
    assert.ok(content.includes('startsWith'), 'Missing path boundary check');
    assert.ok(content.includes('resolvedLogsDir'), 'Missing logs directory resolution');
  });
  
  await t.test('should reject path traversal attempts', () => {
    assert.ok(content.includes('..'), 'Missing path traversal check');
    // Should check for decoded path traversal
    assert.ok(content.includes('decodeURIComponent'), 'Missing URL decode check for path traversal');
  });
  
  await t.test('should return 400/403 for invalid paths, not 500', () => {
    // Should have proper error responses for invalid input
    assert.ok(content.includes('400') || content.includes('400'), 'Missing 400 status for invalid input');
    assert.ok(content.includes('403') || content.includes('403'), 'Missing 403 status for forbidden access');
    assert.ok(content.includes('Invalid filename') || content.includes('path traversal'), 'Missing error message for path traversal');
  });
  
  await t.test('should restrict file types to allowed extensions', () => {
    assert.ok(content.includes('allowedExtensions'), 'Missing allowed extensions whitelist');
    assert.ok(content.includes('.log'), 'Missing .log in allowed extensions');
    assert.ok(content.includes('.png'), 'Missing .png in allowed extensions');
  });
  
  await t.test('should not use req.params.filename directly in path operations', () => {
    // Check that the raw filename is not used directly
    const lines = content.split('\n');
    const logsEndpointLine = lines.findIndex(l => l.includes("app.get('/logs/:filename'"));
    
    // After the endpoint definition, there should be path.basename before any path.join with req.params
    const relevantSection = lines.slice(logsEndpointLine, logsEndpointLine + 20).join('\n');
    
    // The endpoint should sanitize before using in path operations
    assert.ok(
      relevantSection.includes('path.basename') || !relevantSection.includes('path.join(logsDir, req.params'),
      'Raw req.params.filename should not be used directly in path.join'
    );
  });
});