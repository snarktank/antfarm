import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const landingDir = resolve(__dirname, '..');

describe('Landing page', () => {
  it('index.html exists', () => {
    assert.ok(existsSync(resolve(landingDir, 'index.html')));
  });

  it('style.css exists', () => {
    assert.ok(existsSync(resolve(landingDir, 'style.css')));
  });

  it('index.html contains required sections', () => {
    const html = readFileSync(resolve(landingDir, 'index.html'), 'utf-8');
    assert.ok(html.includes('id="features"'), 'missing features section');
    assert.ok(html.includes('id="quickstart"'), 'missing quickstart section');
    assert.ok(html.includes('id="commands"'), 'missing commands section');
    assert.ok(html.includes('<title>'), 'missing title');
    assert.ok(html.includes('meta name="viewport"'), 'missing viewport meta');
    assert.ok(html.includes('meta name="description"'), 'missing description meta');
  });

  it('index.html references style.css', () => {
    const html = readFileSync(resolve(landingDir, 'index.html'), 'utf-8');
    assert.ok(html.includes('style.css'));
  });

  it('style.css contains essential rules', () => {
    const css = readFileSync(resolve(landingDir, 'style.css'), 'utf-8');
    assert.ok(css.includes('.hero'), 'missing hero styles');
    assert.ok(css.includes('.feature-grid'), 'missing feature grid');
    assert.ok(css.includes('@media'), 'missing responsive styles');
  });

  it('all internal links have valid targets', () => {
    const html = readFileSync(resolve(landingDir, 'index.html'), 'utf-8');
    const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
    for (const id of anchors) {
      assert.ok(html.includes(`id="${id}"`), `missing target for #${id}`);
    }
  });
});
