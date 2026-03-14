import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..', '..');

test('evernote-backup should not contain hardcoded database credentials', () => {
  const filePath = join(repoRoot, 'evernote-backup', 'import-to-server.js');
  
  if (!existsSync(filePath)) {
    console.log('evernote-backup/import-to-server.js not found, skipping test');
    return;
  }
  
  const content = readFileSync(filePath, 'utf8');
  
  // Check that hardcoded credentials are not present
  assert.ok(!content.includes("user: 'joplin'"), 'Hardcoded user credential found');
  assert.ok(!content.includes('user: "joplin"'), 'Hardcoded user credential found');
  assert.ok(!content.includes("password: 'joplin'"), 'Hardcoded password credential found');
  assert.ok(!content.includes('password: "joplin"'), 'Hardcoded password credential found');
});

test('evernote-backup should use environment variables for credentials', () => {
  const filePath = join(repoRoot, 'evernote-backup', 'import-to-server.js');
  
  if (!existsSync(filePath)) {
    console.log('evernote-backup/import-to-server.js not found, skipping test');
    return;
  }
  
  const content = readFileSync(filePath, 'utf8');
  
  // Check that environment variables are used
  assert.ok(content.includes('process.env.DB_USER'), 'DB_USER env var not used');
  assert.ok(content.includes('process.env.DB_PASSWORD'), 'DB_PASSWORD env var not used');
});

test('evernote-backup should validate required environment variables', () => {
  const filePath = join(repoRoot, 'evernote-backup', 'import-to-server.js');
  
  if (!existsSync(filePath)) {
    console.log('evernote-backup/import-to-server.js not found, skipping test');
    return;
  }
  
  const content = readFileSync(filePath, 'utf8');
  
  // Check that validation exists
  assert.ok(content.includes('process.exit(1)'), 'Missing process.exit(1) for validation');
  assert.ok(content.includes('DB_USER') && content.includes('DB_PASSWORD'), 'Missing env var validation');
});

test('evernote-backup should have .env.example file', () => {
  const examplePath = join(repoRoot, 'evernote-backup', '.env.example');
  
  if (!existsSync(join(repoRoot, 'evernote-backup', 'import-to-server.js'))) {
    console.log('evernote-backup not found, skipping test');
    return;
  }
  
  assert.ok(existsSync(examplePath), '.env.example file not found');
  
  const content = readFileSync(examplePath, 'utf8');
  assert.ok(content.includes('DB_USER'), '.env.example missing DB_USER');
  assert.ok(content.includes('DB_PASSWORD'), '.env.example missing DB_PASSWORD');
});
