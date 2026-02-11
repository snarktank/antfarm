import { exec } from 'node:child_process';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(__dirname, '../healthcheck.js');

exec(`node ${scriptPath}`, (error, stdout, stderr) => {
  if (error) {
    console.error(`exec error: ${error}`);
    process.exit(1);
  }
  try {
    const status = JSON.parse(stdout);
    assert.strictEqual(status.status, 'ok', 'Status should be ok');
    assert.ok(typeof status.uptime === 'number', 'Uptime should be a number');
    assert.ok(status.uptime > 0, 'Uptime should be positive');
    assert.ok(status.memory && typeof status.memory === 'object', 'Memory should be an object');
    console.log('Tests passed!');
  } catch (e) {
    console.error('Failed to parse JSON output or assertion failed:', e);
    process.exit(1);
  }
});
