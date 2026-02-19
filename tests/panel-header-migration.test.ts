import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const srcHTML = path.join(projectRoot, 'src', 'server', 'index.html');
const distHTML = path.join(projectRoot, 'dist', 'server', 'index.html');

describe('US-007: Panel Header and Close Button Migration', () => {
  const html = readFileSync(srcHTML, 'utf-8');

  describe('Close Button Structure', () => {
    it('should use absolute positioning for close button', () => {
      assert.match(html, /<button[^>]*class="[^"]*absolute[^"]*"/);
    });

    it('should position close button at top-3', () => {
      assert.match(html, /<button[^>]*class="[^"]*top-3[^"]*"/);
    });

    it('should position close button at right-4', () => {
      assert.match(html, /<button[^>]*class="[^"]*right-4[^"]*"/);
    });

    it('should have transparent background', () => {
      assert.match(html, /<button[^>]*class="[^"]*bg-transparent[^"]*"/);
    });

    it('should have no border', () => {
      assert.match(html, /<button[^>]*class="[^"]*border-none[^"]*"/);
    });

    it('should have text-xl font size', () => {
      assert.match(html, /<button[^>]*class="[^"]*text-xl[^"]*"/);
    });

    it('should have cursor-pointer', () => {
      assert.match(html, /<button[^>]*class="[^"]*cursor-pointer[^"]*"/);
    });

    it('should have px-2 horizontal padding', () => {
      assert.match(html, /<button[^>]*class="[^"]*px-2[^"]*"/);
    });

    it('should have py-1 vertical padding', () => {
      assert.match(html, /<button[^>]*class="[^"]*py-1[^"]*"/);
    });

    it('should have rounded corners', () => {
      assert.match(html, /<button[^>]*class="[^"]*rounded[^"]*"/);
    });

    it('should have hover:bg-opacity-100 for hover effect', () => {
      assert.match(html, /<button[^>]*class="[^"]*hover:bg-opacity-100[^"]*"/);
    });

    it('should have transition-colors for smooth transitions', () => {
      assert.match(html, /<button[^>]*class="[^"]*transition-colors[^"]*"/);
    });

    it('should preserve color CSS variable', () => {
      const buttonMatch = html.match(/<button[^>]*onclick="closePanel\(\)"[^>]*>/);
      assert.ok(buttonMatch, 'Close button not found');
      assert.match(buttonMatch[0], /style="[^"]*color:var\(--text-secondary\)[^"]*"/);
    });

    it('should have onmouseenter handler for hover color change', () => {
      const buttonMatch = html.match(/<button[^>]*onclick="closePanel\(\)"[^>]*>/);
      assert.ok(buttonMatch, 'Close button not found');
      assert.match(buttonMatch[0], /onmouseenter="[^"]*this\.style\.color='var\(--text-primary\)'[^"]*"/);
    });

    it('should have onmouseleave handler to reset color', () => {
      const buttonMatch = html.match(/<button[^>]*onclick="closePanel\(\)"[^>]*>/);
      assert.ok(buttonMatch, 'Close button not found');
      assert.match(buttonMatch[0], /onmouseleave="[^"]*this\.style\.color='var\(--text-secondary\)'[^"]*"/);
    });

    it('should preserve closePanel() onclick handler', () => {
      assert.match(html, /onclick="closePanel\(\)"/);
    });

    it('should contain × symbol', () => {
      const buttonMatch = html.match(/<button[^>]*onclick="closePanel\(\)"[^>]*>[^<]*<\/button>/);
      assert.ok(buttonMatch, 'Close button not found');
      assert.match(buttonMatch[0], /✕/);
    });
  });

  describe('Panel Title (h2) Structure', () => {
    it('should use text-base for h2 font size', () => {
      const h2Match = html.match(/<h2[^>]*class="[^"]*"[^>]*>\$\{run\.workflow_id\}/);
      assert.ok(h2Match, 'Panel h2 not found');
      assert.match(h2Match[0], /text-base/);
    });

    it('should use font-semibold for h2 weight', () => {
      const h2Match = html.match(/<h2[^>]*class="[^"]*"[^>]*>\$\{run\.workflow_id\}/);
      assert.ok(h2Match, 'Panel h2 not found');
      assert.match(h2Match[0], /font-semibold/);
    });

    it('should use mb-1 for h2 bottom margin', () => {
      const h2Match = html.match(/<h2[^>]*class="[^"]*"[^>]*>\$\{run\.workflow_id\}/);
      assert.ok(h2Match, 'Panel h2 not found');
      assert.match(h2Match[0], /mb-1/);
    });

    it('should use pr-10 for h2 right padding (space for close button)', () => {
      const h2Match = html.match(/<h2[^>]*class="[^"]*"[^>]*>\$\{run\.workflow_id\}/);
      assert.ok(h2Match, 'Panel h2 not found');
      assert.match(h2Match[0], /pr-10/);
    });

    it('should preserve h2 text color CSS variable', () => {
      const h2Match = html.match(/<h2[^>]*>\$\{run\.workflow_id\}/);
      assert.ok(h2Match, 'Panel h2 not found');
      assert.match(h2Match[0], /style="[^"]*color:var\(--text-primary\)[^"]*"/);
    });

    it('should render workflow_id in h2', () => {
      assert.match(html, /<h2[^>]*>\$\{run\.workflow_id\}<\/h2>/);
    });
  });

  describe('Panel Task Description Structure', () => {
    it('should use text-[13px] for task font size', () => {
      const taskMatch = html.match(/<div[^>]*class="[^"]*"[^>]*>\$\{esc\(run\.task\)\}/);
      assert.ok(taskMatch, 'Task div not found');
      assert.match(taskMatch[0], /text-\[13px\]/);
    });

    it('should use mb-4 for task bottom margin', () => {
      const taskMatch = html.match(/<div[^>]*class="[^"]*"[^>]*>\$\{esc\(run\.task\)\}/);
      assert.ok(taskMatch, 'Task div not found');
      assert.match(taskMatch[0], /mb-4/);
    });

    it('should use whitespace-pre-wrap for task', () => {
      const taskMatch = html.match(/<div[^>]*class="[^"]*"[^>]*>\$\{esc\(run\.task\)\}/);
      assert.ok(taskMatch, 'Task div not found');
      assert.match(taskMatch[0], /whitespace-pre-wrap/);
    });

    it('should use break-words for task', () => {
      const taskMatch = html.match(/<div[^>]*class="[^"]*"[^>]*>\$\{esc\(run\.task\)\}/);
      assert.ok(taskMatch, 'Task div not found');
      assert.match(taskMatch[0], /break-words/);
    });

    it('should use max-h-[120px] for task max height', () => {
      const taskMatch = html.match(/<div[^>]*class="[^"]*"[^>]*>\$\{esc\(run\.task\)\}/);
      assert.ok(taskMatch, 'Task div not found');
      assert.match(taskMatch[0], /max-h-\[120px\]/);
    });

    it('should use overflow-y-auto for task scrolling', () => {
      const taskMatch = html.match(/<div[^>]*class="[^"]*"[^>]*>\$\{esc\(run\.task\)\}/);
      assert.ok(taskMatch, 'Task div not found');
      assert.match(taskMatch[0], /overflow-y-auto/);
    });

    it('should use leading-normal for task line height', () => {
      const taskMatch = html.match(/<div[^>]*class="[^"]*"[^>]*>\$\{esc\(run\.task\)\}/);
      assert.ok(taskMatch, 'Task div not found');
      assert.match(taskMatch[0], /leading-normal/);
    });

    it('should preserve task text color CSS variable', () => {
      const taskMatch = html.match(/<div[^>]*>\$\{esc\(run\.task\)\}/);
      assert.ok(taskMatch, 'Task div not found');
      assert.match(taskMatch[0], /style="[^"]*color:var\(--text-secondary\)[^"]*"/);
    });

    it('should render escaped task text', () => {
      assert.match(html, />\$\{esc\(run\.task\)\}</);
    });
  });

  describe('Panel Meta Section Structure', () => {
    it('should use flex for meta container', () => {
      const metaMatch = html.match(/<div[^>]*class="[^"]*"[^>]*>\s*<span[^>]*><span class="\$\{runBadgeInfo\.classes\}"/);
      assert.ok(metaMatch, 'Meta div not found');
      assert.match(metaMatch[0], /flex/);
    });

    it('should use gap-3 for meta container', () => {
      const metaMatch = html.match(/<div[^>]*class="[^"]*"[^>]*>\s*<span[^>]*><span class="\$\{runBadgeInfo\.classes\}"/);
      assert.ok(metaMatch, 'Meta div not found');
      assert.match(metaMatch[0], /gap-3/);
    });

    it('should use mb-5 for meta container bottom margin', () => {
      const metaMatch = html.match(/<div[^>]*class="[^"]*"[^>]*>\s*<span[^>]*><span class="\$\{runBadgeInfo\.classes\}"/);
      assert.ok(metaMatch, 'Meta div not found');
      assert.match(metaMatch[0], /mb-5/);
    });

    it('should use text-xs for meta container font size', () => {
      const metaMatch = html.match(/<div[^>]*class="[^"]*"[^>]*>\s*<span[^>]*><span class="\$\{runBadgeInfo\.classes\}"/);
      assert.ok(metaMatch, 'Meta div not found');
      assert.match(metaMatch[0], /text-xs/);
    });

    it('should use flex-wrap for meta container', () => {
      const metaMatch = html.match(/<div[^>]*class="[^"]*"[^>]*>\s*<span[^>]*><span class="\$\{runBadgeInfo\.classes\}"/);
      assert.ok(metaMatch, 'Meta div not found');
      assert.match(metaMatch[0], /flex-wrap/);
    });

    it('should preserve meta text color CSS variable', () => {
      const metaMatch = html.match(/<div[^>]*>\s*<span[^>]*><span class="\$\{runBadgeInfo\.classes\}"/);
      assert.ok(metaMatch, 'Meta div not found');
      assert.match(metaMatch[0], /style="[^"]*color:var\(--text-secondary\)[^"]*"/);
    });

    it('should use flex for meta span items', () => {
      const metaSpans = html.match(/<div[^>]*>\s*<span class="flex[^"]*"[^>]*>/);
      assert.ok(metaSpans, 'Meta span not found');
    });

    it('should use items-center for meta span items', () => {
      const metaSpans = html.match(/<div[^>]*>\s*<span class="[^"]*items-center[^"]*"[^>]*>/);
      assert.ok(metaSpans, 'Meta span not found');
    });

    it('should use gap-1 for meta span items', () => {
      const metaSpans = html.match(/<div[^>]*>\s*<span class="[^"]*gap-1[^"]*"[^>]*>/);
      assert.ok(metaSpans, 'Meta span not found');
    });

    it('should render status badge in meta', () => {
      assert.match(html, /<span class="\$\{runBadgeInfo\.classes\}" style="\$\{runBadgeInfo\.style\}">\$\{run\.status\}<\/span>/);
    });

    it('should render created timestamp in meta', () => {
      assert.match(html, /Created: \$\{created\}/);
    });

    it('should render updated timestamp in meta', () => {
      assert.match(html, /Updated: \$\{updated\}/);
    });
  });

  describe('CSS Removal', () => {
    it('should remove .panel-close CSS rule', () => {
      assert.ok(!html.includes('.panel-close{position:absolute'), '.panel-close CSS rule should be removed');
    });

    it('should remove .panel-close:hover CSS rule', () => {
      assert.ok(!html.includes('.panel-close:hover{color:var(--text-primary)'), '.panel-close:hover CSS rule should be removed');
    });

    it('should remove .panel h2 CSS rule', () => {
      assert.ok(!html.includes('.panel h2{font-size:16px'), '.panel h2 CSS rule should be removed');
    });

    it('should remove .panel-task CSS rule', () => {
      assert.ok(!html.includes('.panel-task{font-size:13px'), '.panel-task CSS rule should be removed');
    });

    it('should remove .panel-meta CSS rule', () => {
      assert.ok(!html.includes('.panel-meta{display:flex'), '.panel-meta CSS rule should be removed');
    });

    it('should remove .panel-meta span CSS rule', () => {
      assert.ok(!html.includes('.panel-meta span{display:flex'), '.panel-meta span CSS rule should be removed');
    });

    it('should add migration comment for panel header', () => {
      assert.match(html, /\/\* Overlay, panel container, panel header, close button, step rows, and stories section migrated to Tailwind classes \*\//);
    });
  });

  describe('Functional Preservation', () => {
    it('should preserve openRun function', () => {
      assert.match(html, /async function openRun\(id\)/);
    });

    it('should preserve panel.innerHTML assignment', () => {
      assert.match(html, /panel\.innerHTML = `/);
    });

    it('should preserve closePanel function call', () => {
      assert.match(html, /onclick="closePanel\(\)"/);
    });

    it('should preserve workflow_id rendering', () => {
      assert.match(html, /\$\{run\.workflow_id\}/);
    });

    it('should preserve task rendering with esc function', () => {
      assert.match(html, /\$\{esc\(run\.task\)\}/);
    });

    it('should preserve badge rendering', () => {
      assert.match(html, /\$\{runBadgeInfo\.classes\}/);
      assert.match(html, /\$\{runBadgeInfo\.style\}/);
    });

    it('should preserve created timestamp', () => {
      assert.match(html, /Created: \$\{created\}/);
    });

    it('should preserve updated timestamp', () => {
      assert.match(html, /Updated: \$\{updated\}/);
    });

    it('should have steps container with Tailwind classes', () => {
      assert.match(html, /<div class="flex flex-col gap-2">\$\{stepsHTML\}<\/div>/);
    });

    it('should preserve stories-panel div', () => {
      assert.match(html, /<div id="stories-panel"><\/div>/);
    });

    it('should preserve activity-panel div', () => {
      assert.match(html, /<div id="activity-panel"><\/div>/);
    });
  });

  describe('Build Output', () => {
    it('should have dist HTML file after build', () => {
      assert.ok(existsSync(distHTML), 'dist/server/index.html should exist after build');
    });

    it('should match source HTML in dist', () => {
      if (existsSync(distHTML)) {
        const dist = readFileSync(distHTML, 'utf-8');
        assert.ok(dist.includes('absolute top-3 right-4'), 'dist HTML should have migrated close button');
        assert.ok(dist.includes('text-base font-semibold'), 'dist HTML should have migrated h2');
        assert.ok(dist.includes('text-[13px]'), 'dist HTML should have migrated task');
        assert.ok(dist.includes('flex gap-3 mb-5 text-xs flex-wrap'), 'dist HTML should have migrated meta');
      }
    });
  });

  describe('Responsive Design', () => {
    it('should support flex-wrap for meta items on narrow screens', () => {
      assert.match(html, /flex-wrap/);
    });

    it('should have proper gap spacing between meta items', () => {
      assert.match(html, /gap-3/);
    });

    it('should maintain scrolling for long task descriptions', () => {
      const taskMatch = html.match(/<div[^>]*class="[^"]*"[^>]*>\$\{esc\(run\.task\)\}/);
      assert.ok(taskMatch, 'Task div not found');
      assert.match(taskMatch[0], /overflow-y-auto/);
      assert.match(taskMatch[0], /max-h-\[120px\]/);
    });
  });
});
