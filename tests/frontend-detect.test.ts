import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isFrontendChange } from '../src/lib/frontend-detect.ts';

describe('isFrontendChange', () => {
  it('returns true for .html files', () => {
    assert.equal(isFrontendChange(['landing/index.html']), true);
  });

  it('returns true for .css files', () => {
    assert.equal(isFrontendChange(['src/styles/main.css']), true);
  });

  it('returns true for .scss and .less files', () => {
    assert.equal(isFrontendChange(['theme.scss']), true);
    assert.equal(isFrontendChange(['vars.less']), true);
  });

  it('returns true for .jsx and .tsx files', () => {
    assert.equal(isFrontendChange(['src/App.jsx']), true);
    assert.equal(isFrontendChange(['src/Button.tsx']), true);
  });

  it('returns true for .vue and .svelte files', () => {
    assert.equal(isFrontendChange(['src/App.vue']), true);
    assert.equal(isFrontendChange(['src/App.svelte']), true);
  });

  it('returns true for files in frontend directories', () => {
    assert.equal(isFrontendChange(['public/favicon.ico']), true);
    assert.equal(isFrontendChange(['src/components/Header.ts']), true);
    assert.equal(isFrontendChange(['static/logo.png']), true);
    assert.equal(isFrontendChange(['assets/image.jpg']), true);
    assert.equal(isFrontendChange(['src/pages/Home.ts']), true);
    assert.equal(isFrontendChange(['src/views/Dashboard.ts']), true);
    assert.equal(isFrontendChange(['styles/global.ts']), true);
  });

  it('returns false for non-frontend .ts files', () => {
    assert.equal(isFrontendChange(['src/db.ts']), false);
    assert.equal(isFrontendChange(['src/cli/cli.ts']), false);
    assert.equal(isFrontendChange(['src/lib/logger.ts']), false);
  });

  it('returns false for test files even with frontend extensions', () => {
    assert.equal(isFrontendChange(['src/App.test.tsx']), false);
    assert.equal(isFrontendChange(['src/Button.spec.tsx']), false);
    assert.equal(isFrontendChange(['__tests__/landing.html']), false);
  });

  it('returns false for empty input', () => {
    assert.equal(isFrontendChange([]), false);
  });

  it('returns true if any file is frontend among non-frontend files', () => {
    assert.equal(isFrontendChange(['src/db.ts', 'src/cli/cli.ts', 'landing/index.html']), true);
  });
});
