import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const landingDir = resolve(__dirname, '..');

describe('Glass Bowl landing page', () => {
  it('glass-bowl.html exists', () => {
    assert.ok(existsSync(resolve(landingDir, 'glass-bowl.html')));
  });

  it('glass-bowl.html includes interactive essentials', () => {
    const html = readFileSync(resolve(landingDir, 'glass-bowl.html'), 'utf-8');
    assert.ok(html.includes('id="glass-bowl"'), 'missing #glass-bowl container');
    assert.ok(html.includes('<svg'), 'missing svg');
    assert.ok(html.includes('requestAnimationFrame'), 'missing smooth update loop');
    assert.ok(html.includes('wheel'), 'missing zoom handler');
    assert.ok(html.includes('pointerdown'), 'missing pan handler');
    assert.ok(html.includes('gb-tip'), 'missing tooltip UI');
  });
});
