/**
 * Tests for US-006: Migrate overlay and panel container
 *
 * Verifies that:
 * - Overlay uses Tailwind classes for fixed positioning, backdrop, transitions
 * - Panel uses Tailwind classes for width, height, shadow, border
 * - CSS variables preserved for theming
 * - Functional preservation (closePanel, overlay.open state)
 * - Old CSS rules removed
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const srcHTML = path.join(projectRoot, 'src/server/index.html');
const distHTML = path.join(projectRoot, 'dist/server/index.html');

describe('US-006: Overlay and Panel Container Migration', () => {
  const html = readFileSync(srcHTML, 'utf-8');

  describe('Overlay structure', () => {
    it('should have overlay element with id="overlay"', () => {
      assert.match(html, /id="overlay"/);
    });

    it('should use fixed positioning (fixed)', () => {
      assert.match(html, /class="[^"]*fixed[^"]*"[^>]*id="overlay"/);
    });

    it('should use inset-0 for full-screen coverage', () => {
      assert.match(html, /class="[^"]*inset-0[^"]*"[^>]*id="overlay"/);
    });

    it('should use z-[100] for z-index', () => {
      assert.match(html, /class="[^"]*z-\[100\][^"]*"[^>]*id="overlay"/);
    });

    it('should use flex for display', () => {
      assert.match(html, /class="[^"]*flex[^"]*"[^>]*id="overlay"/);
    });

    it('should use items-center for vertical centering', () => {
      assert.match(html, /class="[^"]*items-center[^"]*"[^>]*id="overlay"/);
    });

    it('should use justify-center for horizontal centering', () => {
      assert.match(html, /class="[^"]*justify-center[^"]*"[^>]*id="overlay"/);
    });

    it('should use opacity-0 for initial hidden state', () => {
      assert.match(html, /class="[^"]*opacity-0[^"]*"[^>]*id="overlay"/);
    });

    it('should use pointer-events-none for initial non-interactive state', () => {
      assert.match(html, /class="[^"]*pointer-events-none[^"]*"[^>]*id="overlay"/);
    });

    it('should use transition-opacity for smooth fade', () => {
      assert.match(html, /class="[^"]*transition-opacity[^"]*"[^>]*id="overlay"/);
    });

    it('should use duration-150 for transition timing', () => {
      assert.match(html, /class="[^"]*duration-150[^"]*"[^>]*id="overlay"/);
    });

    it('should preserve CSS variable for background color', () => {
      // Check for overlay element with background CSS variable (attribute order may vary)
      const overlayMatch = html.match(/<div[^>]*id="overlay"[^>]*>/);
      assert.ok(overlayMatch, 'Overlay element should exist');
      assert.ok(overlayMatch[0].includes('background:var(--overlay)'), 'Overlay should have background CSS variable');
    });

    it('should preserve onclick handler for closePanel', () => {
      assert.match(html, /id="overlay"[^>]*onclick="if\(event\.target===this\)closePanel\(\)"/);
    });

    it('should still have "overlay" class for .overlay.open CSS rule', () => {
      assert.match(html, /class="[^"]*overlay[^"]*"[^>]*id="overlay"/);
    });
  });

  describe('Panel structure', () => {
    it('should have panel element with id="panel"', () => {
      assert.match(html, /id="panel"/);
    });

    it('should use relative positioning', () => {
      assert.match(html, /class="[^"]*relative[^"]*"[^>]*id="panel"/);
    });

    it('should use w-[90%] for width', () => {
      assert.match(html, /class="[^"]*w-\[90%\][^"]*"[^>]*id="panel"/);
    });

    it('should use max-w-[640px] for max-width', () => {
      assert.match(html, /class="[^"]*max-w-\[640px\][^"]*"[^>]*id="panel"/);
    });

    it('should use max-h-[85vh] for max-height', () => {
      assert.match(html, /class="[^"]*max-h-\[85vh\][^"]*"[^>]*id="panel"/);
    });

    it('should use overflow-y-auto for vertical scrolling', () => {
      assert.match(html, /class="[^"]*overflow-y-auto[^"]*"[^>]*id="panel"/);
    });

    it('should use p-6 for padding (24px)', () => {
      assert.match(html, /class="[^"]*p-6[^"]*"[^>]*id="panel"/);
    });

    it('should use rounded-xl for border-radius (12px)', () => {
      assert.match(html, /class="[^"]*rounded-xl[^"]*"[^>]*id="panel"/);
    });

    it('should use border for border', () => {
      assert.match(html, /class="[^"]*border[^"]*"[^>]*id="panel"/);
    });

    it('should preserve CSS variable for background color', () => {
      // Check for panel element with background CSS variable (attribute order may vary)
      const panelMatch = html.match(/<div[^>]*id="panel"[^>]*>/);
      assert.ok(panelMatch, 'Panel element should exist');
      assert.ok(panelMatch[0].includes('background:var(--bg-surface)'), 'Panel should have background CSS variable');
    });

    it('should preserve CSS variable for border color', () => {
      const panelMatch = html.match(/<div[^>]*id="panel"[^>]*>/);
      assert.ok(panelMatch, 'Panel element should exist');
      assert.ok(panelMatch[0].includes('border-color:var(--border)'), 'Panel should have border-color CSS variable');
    });

    it('should preserve custom box-shadow via inline style', () => {
      const panelMatch = html.match(/<div[^>]*id="panel"[^>]*>/);
      assert.ok(panelMatch, 'Panel element should exist');
      assert.ok(panelMatch[0].includes('box-shadow:0 8px 32px var(--shadow-heavy)'), 'Panel should have box-shadow CSS variable');
    });
  });

  describe('CSS removal', () => {
    it('should remove old .overlay positioning rule', () => {
      assert.ok(!html.includes('.overlay{position:fixed'), 'Old .overlay rule should be removed');
    });

    it('should remove old .panel rule', () => {
      assert.ok(!html.includes('.panel{background:var'), 'Old .panel rule should be removed');
    });

    it('should preserve .overlay.open rule for JS toggle', () => {
      assert.match(html, /\.overlay\.open\{opacity:1;pointer-events:auto\}/);
    });

    it('should have migration comment (updated in US-008)', () => {
      assert.match(html, /\/\* Overlay, panel container, panel header, close button, and step rows migrated to Tailwind classes \*\//);
    });
  });

  describe('Functional preservation', () => {
    it('should preserve closePanel function', () => {
      assert.match(html, /function closePanel\(\)/);
    });

    it('should preserve overlay click handler', () => {
      assert.match(html, /onclick="if\(event\.target===this\)closePanel\(\)"/);
    });

    it('should preserve Escape key handler', () => {
      assert.match(html, /document\.addEventListener\('keydown'/);
      assert.match(html, /if \(e\.key === 'Escape'\) closePanel\(\)/);
    });

    it('should preserve openRun function that populates panel', () => {
      assert.match(html, /async function openRun\(id\)/);
      assert.match(html, /document\.getElementById\('overlay'\)\.classList\.add\('open'\)/);
    });

    it('should note that panel header CSS was migrated in US-007', () => {
      // Panel header, close button, task, and meta CSS migrated to Tailwind in US-007
      assert.ok(!html.includes('.panel-close{'), 'panel-close CSS migrated to Tailwind');
      assert.ok(!html.includes('.panel h2{'), 'panel h2 CSS migrated to Tailwind');
      assert.ok(!html.includes('.panel-task{'), 'panel-task CSS migrated to Tailwind');
      assert.ok(!html.includes('.panel-meta{'), 'panel-meta CSS migrated to Tailwind');
    });
  });

  describe('Build output', () => {
    it('should have dist HTML file after build', () => {
      assert.ok(existsSync(distHTML), 'dist/server/index.html should exist after build');
    });

    it('should have matching overlay structure in dist', () => {
      const dist = readFileSync(distHTML, 'utf-8');
      assert.match(dist, /class="[^"]*fixed[^"]*inset-0[^"]*"[^>]*id="overlay"/);
    });

    it('should have matching panel structure in dist', () => {
      const dist = readFileSync(distHTML, 'utf-8');
      assert.match(dist, /class="[^"]*relative[^"]*w-\[90%\][^"]*max-w-\[640px\][^"]*"[^>]*id="panel"/);
    });
  });

  describe('Responsive design', () => {
    it('should maintain 90% width that scales with viewport', () => {
      assert.match(html, /w-\[90%\]/);
    });

    it('should maintain max-width constraint for large screens', () => {
      assert.match(html, /max-w-\[640px\]/);
    });

    it('should maintain max-height constraint for viewport', () => {
      assert.match(html, /max-h-\[85vh\]/);
    });

    it('should maintain overflow-y-auto for scrollable content', () => {
      assert.match(html, /overflow-y-auto/);
    });
  });

  describe('Transition behavior', () => {
    it('should use transition-opacity for smooth fade effect', () => {
      assert.match(html, /transition-opacity/);
    });

    it('should use duration-150 matching old .15s timing', () => {
      assert.match(html, /duration-150/);
    });

    it('should start with opacity-0 (hidden)', () => {
      assert.match(html, /opacity-0/);
    });

    it('should start with pointer-events-none (non-interactive)', () => {
      assert.match(html, /pointer-events-none/);
    });

    it('should toggle to opacity:1 and pointer-events:auto via .overlay.open', () => {
      assert.match(html, /\.overlay\.open\{opacity:1;pointer-events:auto\}/);
    });
  });
});
