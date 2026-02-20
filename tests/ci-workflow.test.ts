import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const workflowPath = path.resolve(import.meta.dirname, '../.github/workflows/ci.yml');

describe('CI workflow YAML structure', () => {
  it('ci.yml file exists', () => {
    assert.ok(fs.existsSync(workflowPath), `Expected ${workflowPath} to exist`);
  });

  it('has on.pull_request trigger (no branch filter)', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(content.includes('pull_request'), 'Expected pull_request trigger');
  });

  it('has on.push.branches: [main] trigger', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(content.includes('push'), 'Expected push trigger');
    assert.ok(content.includes('main'), 'Expected push to main branch');
  });

  it('uses ubuntu-latest', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(content.includes('ubuntu-latest'), 'Expected ubuntu-latest');
  });

  it('uses node-version 22', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(content.includes("'22'") || content.includes('"22"') || content.includes('22'), 'Expected node-version 22');
  });

  it('has install step with npm ci', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(content.includes('npm ci'), 'Expected npm ci install step');
  });

  it('has build step with npm run build', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(content.includes('npm run build'), 'Expected npm run build step');
  });

  it('has test step with node --test', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(
      content.includes('node --test --experimental-strip-types tests/*.test.ts'),
      'Expected test step with node --test',
    );
  });

  it('has exactly three run steps (install, build, test)', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    const runMatches = content.match(/^\s+run:/gm);
    assert.equal(runMatches?.length, 3, `Expected 3 run steps, got ${runMatches?.length}`);
  });

  it('has no lint step', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(!content.toLowerCase().includes('lint'), 'Expected no lint step');
  });
});
