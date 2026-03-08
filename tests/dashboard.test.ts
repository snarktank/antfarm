import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const html = await readFile(new URL('../dashboard/index.html', import.meta.url), 'utf8');

describe('dashboard/index.html', () => {
  it('mentions the Antfarm dashboard title', () => {
    assert.match(html, /Antfarm Workflow Dashboard/);
  });

  it('points at the local Antfarm database path', () => {
    assert.match(html, /file:\/\/\/home\/adam\/\.openclaw\/antfarm\/antfarm\.db/);
  });

  it('loads SQL.js from a CDN', () => {
    assert.match(html, /sql\.js/);
  });
});
