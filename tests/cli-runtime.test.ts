import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { chmodSync } from 'node:fs';

const cliPath = resolve(process.cwd(), 'dist/cli/cli.js');

// Ensure executable (just in case)
try {
  chmodSync(cliPath, '755');
} catch {
  // Ignore if dist doesn't exist yet (build should have run)
}

test('CLI Runtime: Executes directly via shebang', () => {
  try {
    // Execute directly without "node" prefix to test shebang
    const output = execSync(`${cliPath} --help`, { encoding: 'utf-8' });
    
    // Validate output
    assert.match(output, /antfarm install/, 'Output should contain usage instructions');
    assert.match(output, /antfarm version/, 'Output should contain usage instructions');
    
    // Validate exit code implicitly (execSync throws if exit code != 0)
  } catch (err: any) {
    if (err.stdout) console.log('STDOUT:', err.stdout.toString());
    if (err.stderr) console.error('STDERR:', err.stderr.toString());
    assert.fail(`CLI failed to execute directly: ${err.message}`);
  }
});

test('CLI Runtime: Returns version', () => {
  try {
    const output = execSync(`${cliPath} --version`, { encoding: 'utf-8' });
    assert.match(output, /antfarm v\d+\.\d+\.\d+/, 'Output should contain version number');
  } catch (err: any) {
    if (err.stdout) console.log('STDOUT:', err.stdout.toString());
    if (err.stderr) console.error('STDERR:', err.stderr.toString());
    assert.fail(`CLI failed to show version: ${err.message}`);
  }
});
