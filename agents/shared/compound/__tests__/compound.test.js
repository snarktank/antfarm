import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const compoundDir = resolve(__dirname, '..');

describe('Compound agent persona files', () => {
  it('AGENTS.md exists', () => {
    assert.ok(existsSync(resolve(compoundDir, 'AGENTS.md')));
  });

  it('SOUL.md exists', () => {
    assert.ok(existsSync(resolve(compoundDir, 'SOUL.md')));
  });

  it('IDENTITY.md exists', () => {
    assert.ok(existsSync(resolve(compoundDir, 'IDENTITY.md')));
  });

  it('IDENTITY.md has name and role', () => {
    const content = readFileSync(resolve(compoundDir, 'IDENTITY.md'), 'utf-8');
    assert.ok(content.includes('Name: Compound'), 'missing name');
    assert.ok(content.includes('Role:'), 'missing role');
  });

  it('SOUL.md describes knowledge curator persona', () => {
    const content = readFileSync(resolve(compoundDir, 'SOUL.md'), 'utf-8');
    assert.ok(content.includes('knowledge curator'), 'missing knowledge curator description');
    assert.ok(content.includes('actionable insights'), 'missing actionable insights focus');
  });

  it('AGENTS.md instructs writing YAML-frontmatter learnings to docs/learnings/', () => {
    const content = readFileSync(resolve(compoundDir, 'AGENTS.md'), 'utf-8');
    assert.ok(content.includes('docs/learnings/'), 'missing docs/learnings/ path');
    assert.ok(content.includes('YAML frontmatter') || content.includes('YAML-frontmatter') || content.includes('frontmatter'), 'missing YAML frontmatter instruction');
    assert.ok(content.includes('date:'), 'missing date in frontmatter');
    assert.ok(content.includes('workflow:'), 'missing workflow in frontmatter');
    assert.ok(content.includes('category:'), 'missing category in frontmatter');
    assert.ok(content.includes('tags:'), 'missing tags in frontmatter');
    assert.ok(content.includes('run_id:'), 'missing run_id in frontmatter');
  });

  it('AGENTS.md instructs consolidation with existing learnings', () => {
    const content = readFileSync(resolve(compoundDir, 'AGENTS.md'), 'utf-8');
    assert.ok(content.includes('Consolidate'), 'missing consolidation instruction');
    assert.ok(content.includes('duplicate') || content.includes('duplication'), 'missing deduplication instruction');
  });

  it('AGENTS.md instructs optional update of CLAUDE.md or AGENTS.md', () => {
    const content = readFileSync(resolve(compoundDir, 'AGENTS.md'), 'utf-8');
    assert.ok(content.includes('CLAUDE.md'), 'missing CLAUDE.md update instruction');
    assert.ok(content.includes('AGENTS.md'), 'missing AGENTS.md update instruction');
    assert.ok(content.includes('optionally') || content.includes('Optional'), 'missing optional qualifier');
  });

  it('AGENTS.md specifies output format with required keys', () => {
    const content = readFileSync(resolve(compoundDir, 'AGENTS.md'), 'utf-8');
    assert.ok(content.includes('STATUS:'), 'missing STATUS key');
    assert.ok(content.includes('LEARNINGS_FILE:'), 'missing LEARNINGS_FILE key');
    assert.ok(content.includes('PATTERNS_FOUND:'), 'missing PATTERNS_FOUND key');
    assert.ok(content.includes('RULES_ADDED:'), 'missing RULES_ADDED key');
  });
});
