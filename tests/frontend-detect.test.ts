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

  it('returns false for shell scripts and other non-frontend files', () => {
    assert.equal(isFrontendChange(['scripts/deploy.sh']), false);
    assert.equal(isFrontendChange(['Makefile']), false);
    assert.equal(isFrontendChange(['README.md']), false);
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

  // --- Additional edge-case tests (p48-s3) ---

  it('detects React project files (.jsx/.tsx in src)', () => {
    assert.equal(isFrontendChange(['src/components/Button.jsx']), true);
    assert.equal(isFrontendChange(['src/hooks/useAuth.tsx']), true);
    assert.equal(isFrontendChange(['src/components/Modal.tsx']), true);
  });

  it('detects Vue project files (.vue)', () => {
    assert.equal(isFrontendChange(['src/components/Header.vue']), true);
    assert.equal(isFrontendChange(['src/views/Home.vue']), true);
  });

  it('detects Next.js-style pages directory files', () => {
    assert.equal(isFrontendChange(['pages/index.ts']), true);
    assert.equal(isFrontendChange(['src/pages/api/hello.ts']), true);
    assert.equal(isFrontendChange(['pages/_app.tsx']), true);
  });

  it('returns false for backend-only projects with no frontend files', () => {
    assert.equal(isFrontendChange(['src/server.ts', 'src/routes/api.ts', 'package.json']), false);
    assert.equal(isFrontendChange(['src/worker/heartbeat.ts', 'src/db.ts']), false);
    assert.equal(isFrontendChange(['.env', 'tsconfig.json', 'package-lock.json']), false);
  });

  it('handles files without extensions gracefully', () => {
    assert.equal(isFrontendChange(['Dockerfile']), false);
    assert.equal(isFrontendChange(['Makefile']), false);
    assert.equal(isFrontendChange(['.gitignore']), false);
  });

  it('handles case-insensitive extension matching', () => {
    assert.equal(isFrontendChange(['page.HTML']), true);
    assert.equal(isFrontendChange(['style.CSS']), true);
    assert.equal(isFrontendChange(['app.JSX']), true);
  });

  it('handles Windows-style backslash paths', () => {
    assert.equal(isFrontendChange(['src\\components\\Button.tsx']), true);
    assert.equal(isFrontendChange(['src\\pages\\Home.ts']), true);
  });

  it('handles deeply nested frontend directories', () => {
    assert.equal(isFrontendChange(['packages/ui/src/components/Button.ts']), true);
    assert.equal(isFrontendChange(['apps/web/public/manifest.json']), true);
  });

  it('returns false for test files in frontend directories', () => {
    assert.equal(isFrontendChange(['src/components/Button.test.tsx']), false);
    assert.equal(isFrontendChange(['__tests__/views/Home.vue']), false);
    assert.equal(isFrontendChange(['pages/index.spec.tsx']), false);
  });

  it('handles single-file input', () => {
    assert.equal(isFrontendChange(['index.html']), true);
    assert.equal(isFrontendChange(['server.ts']), false);
  });
});
