import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const cliPath = resolve(process.cwd(), 'dist/cli/cli.js');

test('CLI: --help works and exits with 0', () => {
  try {
    const output = execSync(`node ${cliPath} --help`, { encoding: 'utf-8' });
    assert.match(output, /antfarm install/);
    assert.match(output, /antfarm version/);
  } catch (err: any) {
    assert.fail(`CLI failed with error: ${err.message}`);
  }
});

test('CLI: --version works', () => {
  try {
    const output = execSync(`node ${cliPath} --version`, { encoding: 'utf-8' });
    assert.match(output, /antfarm v/);
  } catch (err: any) {
    assert.fail(`CLI failed with error: ${err.message}`);
  }
});
