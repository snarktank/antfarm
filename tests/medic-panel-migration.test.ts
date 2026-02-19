import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const srcHtmlPath = path.join(projectRoot, 'src/server/index.html');
const distHtmlPath = path.join(projectRoot, 'dist/server/index.html');

describe('US-013: Medic Panel Migration', () => {
  const srcHtml = readFileSync(srcHtmlPath, 'utf-8');

  describe('Medic panel container structure', () => {
    it('should use Tailwind fixed positioning (fixed top-[60px] right-4)', () => {
      const panelMatch = srcHtml.match(/<div[^>]*id="medic-panel"[^>]*>/);
      assert.ok(panelMatch, 'Medic panel element should exist');
      const panel = panelMatch[0];
      assert.match(panel, /class="[^"]*fixed[^"]*"/, 'Should have fixed class');
      assert.match(panel, /class="[^"]*top-\[60px\][^"]*"/, 'Should have top-[60px] class');
      assert.match(panel, /class="[^"]*right-4[^"]*"/, 'Should have right-4 class');
    });

    it('should use Tailwind width constraint (w-[340px])', () => {
      const panelMatch = srcHtml.match(/<div[^>]*id="medic-panel"[^>]*>/);
      const panel = panelMatch[0];
      assert.match(panel, /class="[^"]*w-\[340px\][^"]*"/, 'Should have w-[340px] class');
    });

    it('should use Tailwind max-height (max-h-[500px])', () => {
      const panelMatch = srcHtml.match(/<div[^>]*id="medic-panel"[^>]*>/);
      const panel = panelMatch[0];
      assert.match(panel, /class="[^"]*max-h-\[500px\][^"]*"/, 'Should have max-h-[500px] class');
    });

    it('should use Tailwind border and rounded corners (border rounded-[10px])', () => {
      const panelMatch = srcHtml.match(/<div[^>]*id="medic-panel"[^>]*>/);
      const panel = panelMatch[0];
      assert.match(panel, /class="[^"]*border[^"]*"/, 'Should have border class');
      assert.match(panel, /class="[^"]*rounded-\[10px\][^"]*"/, 'Should have rounded-[10px] class');
    });

    it('should use Tailwind z-index (z-[50])', () => {
      const panelMatch = srcHtml.match(/<div[^>]*id="medic-panel"[^>]*>/);
      const panel = panelMatch[0];
      assert.match(panel, /class="[^"]*z-\[50\][^"]*"/, 'Should have z-[50] class');
    });

    it('should use Tailwind overflow (overflow-hidden)', () => {
      const panelMatch = srcHtml.match(/<div[^>]*id="medic-panel"[^>]*>/);
      const panel = panelMatch[0];
      assert.match(panel, /class="[^"]*overflow-hidden[^"]*"/, 'Should have overflow-hidden class');
    });

    it('should use Tailwind hidden and flex-col for layout', () => {
      const panelMatch = srcHtml.match(/<div[^>]*id="medic-panel"[^>]*>/);
      const panel = panelMatch[0];
      assert.match(panel, /class="[^"]*hidden[^"]*"/, 'Should have hidden class');
      assert.match(panel, /class="[^"]*flex-col[^"]*"/, 'Should have flex-col class');
    });

    it('should preserve medic-panel class for JS toggle', () => {
      const panelMatch = srcHtml.match(/<div[^>]*id="medic-panel"[^>]*>/);
      const panel = panelMatch[0];
      assert.match(panel, /class="[^"]*medic-panel[^"]*"/, 'Should have medic-panel class');
    });

    it('should preserve CSS variables for background, border, and shadow', () => {
      const panelMatch = srcHtml.match(/<div[^>]*id="medic-panel"[^>]*>/);
      const panel = panelMatch[0];
      assert.match(panel, /style="[^"]*background:var\(--bg-surface\)[^"]*"/, 'Should preserve background CSS variable');
      assert.match(panel, /style="[^"]*border-color:var\(--border\)[^"]*"/, 'Should preserve border-color CSS variable');
      assert.match(panel, /style="[^"]*box-shadow:[^"]*var\(--shadow-heavy\)[^"]*"/, 'Should preserve box-shadow CSS variable');
    });
  });

  describe('Medic panel header structure', () => {
    it('should use Tailwind padding (px-4 py-3.5)', () => {
      assert.match(srcHtml, /<div class="[^"]*px-4[^"]*"[^>]*>Workflow Medic<\/div>/, 'Panel header should have px-4 class');
      assert.match(srcHtml, /<div class="[^"]*py-3\.5[^"]*"[^>]*>Workflow Medic<\/div>/, 'Panel header should have py-3.5 class');
    });

    it('should use Tailwind border-bottom (border-b)', () => {
      assert.match(srcHtml, /<div class="[^"]*border-b[^"]*"[^>]*>Workflow Medic<\/div>/, 'Panel header should have border-b class');
    });

    it('should use Tailwind typography (text-sm font-semibold)', () => {
      assert.match(srcHtml, /<div class="[^"]*text-sm[^"]*"[^>]*>Workflow Medic<\/div>/, 'Panel header should have text-sm class');
      assert.match(srcHtml, /<div class="[^"]*font-semibold[^"]*"[^>]*>Workflow Medic<\/div>/, 'Panel header should have font-semibold class');
    });

    it('should use Tailwind flex layout (flex items-center gap-2)', () => {
      assert.match(srcHtml, /<div class="[^"]*flex[^"]*"[^>]*>Workflow Medic<\/div>/, 'Panel header should have flex class');
      assert.match(srcHtml, /<div class="[^"]*items-center[^"]*"[^>]*>Workflow Medic<\/div>/, 'Panel header should have items-center class');
      assert.match(srcHtml, /<div class="[^"]*gap-2[^"]*"[^>]*>Workflow Medic<\/div>/, 'Panel header should have gap-2 class');
    });

    it('should preserve CSS variables for border and text color', () => {
      const headerRegex = /<div class="[^"]*"[^>]*style="[^"]*"[^>]*>Workflow Medic<\/div>/;
      const headerMatch = srcHtml.match(headerRegex);
      assert.ok(headerMatch, 'Panel header element should exist with style attribute');
      const header = headerMatch[0];
      assert.match(header, /style="[^"]*border-color:var\(--border-light\)[^"]*"/, 'Should preserve border-color CSS variable');
      assert.match(header, /style="[^"]*color:var\(--text-primary\)[^"]*"/, 'Should preserve text color CSS variable');
    });
  });

  describe('Medic panel body structure', () => {
    it('should use Tailwind padding (px-4 py-3)', () => {
      const bodyMatch = srcHtml.match(/<div[^>]*id="medic-panel-body"[^>]*>/);
      assert.ok(bodyMatch, 'Panel body element should exist');
      const body = bodyMatch[0];
      assert.match(body, /class="[^"]*px-4[^"]*"/, 'Panel body should have px-4 class');
      assert.match(body, /class="[^"]*py-3[^"]*"/, 'Panel body should have py-3 class');
    });

    it('should use Tailwind overflow (overflow-y-auto)', () => {
      const bodyMatch = srcHtml.match(/<div[^>]*id="medic-panel-body"[^>]*>/);
      const body = bodyMatch[0];
      assert.match(body, /class="[^"]*overflow-y-auto[^"]*"/, 'Panel body should have overflow-y-auto class');
    });

    it('should use Tailwind flex (flex-1)', () => {
      const bodyMatch = srcHtml.match(/<div[^>]*id="medic-panel-body"[^>]*>/);
      const body = bodyMatch[0];
      assert.match(body, /class="[^"]*flex-1[^"]*"/, 'Panel body should have flex-1 class');
    });
  });

  describe('Medic stat rows in loadMedicData function', () => {
    it('should use Tailwind flex layout (flex justify-between)', () => {
      assert.match(srcHtml, /class="flex justify-between/, 'Medic stat rows should use flex justify-between');
    });

    it('should use Tailwind padding (py-1.5)', () => {
      assert.match(srcHtml, /py-1\.5 text-xs/, 'Medic stat rows should have py-1.5 class');
    });

    it('should use Tailwind typography (text-xs)', () => {
      assert.match(srcHtml, /py-1\.5 text-xs/, 'Medic stat rows should have text-xs class');
    });

    it('should use Tailwind border-bottom (border-b) for non-last rows', () => {
      assert.match(srcHtml, /py-1\.5 text-xs border-b/, 'Most medic stat rows should have border-b class');
    });

    it('should omit border-b for last stat row', () => {
      assert.match(srcHtml, /py-1\.5 text-xs"[^>]*>.*Auto-fixed/, 'Last stat row should not have border-b');
    });

    it('should use Tailwind font-semibold for stat values', () => {
      assert.match(srcHtml, /<span class="font-semibold"/, 'Stat values should have font-semibold class');
    });

    it('should preserve CSS variables for text colors', () => {
      assert.match(srcHtml, /color:var\(--text-secondary\)/, 'Stat labels should use text-secondary color');
      assert.match(srcHtml, /color:var\(--text-primary\)/, 'Stat values should use text-primary color');
    });

    it('should preserve CSS variable for border color', () => {
      assert.match(srcHtml, /border-color:var\(--border-light\)/, 'Stat rows should use border-light color');
    });
  });

  describe('Medic check rows in loadMedicData function', () => {
    it('should use Tailwind padding (py-2)', () => {
      assert.match(srcHtml, /py-2 text-\[11px\]/, 'Check rows should have py-2 class');
    });

    it('should use Tailwind typography (text-[11px] leading-normal)', () => {
      assert.match(srcHtml, /py-2 text-\[11px\] leading-normal/, 'Check rows should have text-[11px] leading-normal');
    });

    it('should use Tailwind conditional border-bottom', () => {
      assert.match(srcHtml, /const borderClass = .*\? '' : 'border-b'/, 'Check rows should conditionally apply border-b');
    });

    it('should use Tailwind font-mono for timestamp', () => {
      assert.match(srcHtml, /<span class="font-mono"/, 'Timestamp should have font-mono class');
    });

    it('should use Tailwind margin (ml-2) for summary span', () => {
      assert.match(srcHtml, /class="ml-2"/, 'Summary span should have ml-2 class');
    });

    it('should preserve CSS variables for text colors', () => {
      const loadMedicDataMatch = srcHtml.match(/async function loadMedicData\(\)[\s\S]*?^}/m);
      assert.ok(loadMedicDataMatch, 'loadMedicData function should exist');
      const functionBody = loadMedicDataMatch[0];
      assert.match(functionBody, /color:var\(--text-secondary\)/, 'Timestamp should use text-secondary color');
      assert.match(functionBody, /var\(--accent-teal\)/, 'Fixed checks should reference accent-teal variable');
      assert.match(functionBody, /var\(--accent-orange\)/, 'Issues should reference accent-orange variable');
    });

    it('should preserve CSS variable for border color', () => {
      assert.match(srcHtml, /border-color:var\(--border-light\)/, 'Check rows should use border-light color');
    });
  });

  describe('Recent Checks header styling', () => {
    it('should use Tailwind typography (text-xs font-semibold)', () => {
      assert.match(srcHtml, /"text-xs font-semibold mb-2".*Recent Checks/, 'Recent Checks header should have text-xs font-semibold classes');
    });

    it('should use Tailwind margin (mb-2)', () => {
      assert.match(srcHtml, /"text-xs font-semibold mb-2".*Recent Checks/, 'Recent Checks header should have mb-2 class');
    });

    it('should preserve CSS variable for text color', () => {
      assert.match(srcHtml, /color:var\(--text-primary\).*Recent Checks/, 'Recent Checks header should use text-primary color');
    });
  });

  describe('CSS removal', () => {
    it('should remove old .medic-panel CSS rule', () => {
      assert.doesNotMatch(srcHtml, /\.medic-panel\{position:fixed/, 'Old .medic-panel CSS rule should be removed');
    });

    it('should remove old .medic-panel-header CSS rule', () => {
      assert.doesNotMatch(srcHtml, /\.medic-panel-header\{/, 'Old .medic-panel-header CSS rule should be removed');
    });

    it('should remove old .medic-panel-body CSS rule', () => {
      assert.doesNotMatch(srcHtml, /\.medic-panel-body\{/, 'Old .medic-panel-body CSS rule should be removed');
    });

    it('should remove old .medic-stat CSS rule', () => {
      assert.doesNotMatch(srcHtml, /\.medic-stat\{/, 'Old .medic-stat CSS rule should be removed');
    });

    it('should remove old .medic-stat-value CSS rule', () => {
      assert.doesNotMatch(srcHtml, /\.medic-stat-value\{/, 'Old .medic-stat-value CSS rule should be removed');
    });

    it('should remove old .medic-check-row CSS rule', () => {
      assert.doesNotMatch(srcHtml, /\.medic-check-row\{/, 'Old .medic-check-row CSS rule should be removed');
    });

    it('should remove old .medic-check-time CSS rule', () => {
      assert.doesNotMatch(srcHtml, /\.medic-check-time\{/, 'Old .medic-check-time CSS rule should be removed');
    });

    it('should remove old .medic-check-summary CSS rule', () => {
      assert.doesNotMatch(srcHtml, /\.medic-check-summary\{/, 'Old .medic-check-summary CSS rule should be removed');
    });

    it('should preserve .medic-panel.open CSS rule for JS toggle', () => {
      assert.match(srcHtml, /\.medic-panel\.open\{display:flex\}/, '.medic-panel.open CSS rule should be preserved for JavaScript toggle');
    });

    it('should add migration comment', () => {
      assert.match(srcHtml, /\/\* Medic panel migrated to Tailwind classes \*\//, 'Should have migration comment');
    });
  });

  describe('Functional preservation', () => {
    it('should preserve toggleMedicPanel function', () => {
      assert.match(srcHtml, /function toggleMedicPanel\(\)/, 'toggleMedicPanel function should exist');
      assert.match(srcHtml, /medicPanelOpen = !medicPanelOpen/, 'Toggle logic should be preserved');
    });

    it('should preserve loadMedicData function', () => {
      assert.match(srcHtml, /async function loadMedicData\(\)/, 'loadMedicData function should exist');
      assert.match(srcHtml, /fetchJSON\('\/api\/medic\/status'\)/, 'API call for status should be preserved');
      assert.match(srcHtml, /fetchJSON\('\/api\/medic\/checks\?limit=10'\)/, 'API call for checks should be preserved');
    });

    it('should preserve loadMedicStatus function', () => {
      assert.match(srcHtml, /async function loadMedicStatus\(\)/, 'loadMedicStatus function should exist');
    });

    it('should preserve medic panel open/close toggle behavior', () => {
      assert.match(srcHtml, /classList\.toggle\('open', medicPanelOpen\)/, 'Toggle class logic should be preserved');
    });

    it('should preserve click outside to close behavior', () => {
      assert.match(srcHtml, /document\.addEventListener\('click', e => \{/, 'Click event listener should exist');
      assert.match(srcHtml, /!panel\.contains\(e\.target\) && !badge\.contains\(e\.target\)/, 'Click outside detection should be preserved');
    });

    it('should preserve medic badge click handler', () => {
      assert.match(srcHtml, /onclick="toggleMedicPanel\(\)"/, 'Medic badge should have toggleMedicPanel onclick handler');
    });

    it('should preserve medic status polling interval', () => {
      assert.match(srcHtml, /setInterval\(loadMedicStatus, 30000\)/, 'Status polling interval should be preserved');
    });
  });

  describe('Build output', () => {
    it('should have dist HTML file', () => {
      assert.ok(existsSync(distHtmlPath), 'dist/server/index.html should exist after build');
    });

    it('should match source HTML (dist mirrors src)', () => {
      if (existsSync(distHtmlPath)) {
        const distHtml = readFileSync(distHtmlPath, 'utf-8');
        const srcPanel = srcHtml.match(/<div[^>]*id="medic-panel"[^>]*>/);
        const distPanel = distHtml.match(/<div[^>]*id="medic-panel"[^>]*>/);
        assert.ok(srcPanel && distPanel, 'Both src and dist should have medic panel');
        // Check that key Tailwind classes are present in dist
        assert.match(distPanel[0], /class="[^"]*fixed[^"]*"/, 'Dist panel should have fixed class');
        assert.match(distPanel[0], /class="[^"]*w-\[340px\][^"]*"/, 'Dist panel should have w-[340px] class');
      }
    });
  });

  describe('Responsive design', () => {
    it('should use fixed positioning for panel', () => {
      assert.match(srcHtml, /class="[^"]*fixed[^"]*"[^>]*id="medic-panel"/, 'Panel should use fixed positioning');
    });

    it('should position panel in top-right corner', () => {
      const panelMatch = srcHtml.match(/<div[^>]*id="medic-panel"[^>]*>/);
      const panel = panelMatch[0];
      assert.match(panel, /class="[^"]*top-\[60px\][^"]*"/, 'Panel should be positioned below header');
      assert.match(panel, /class="[^"]*right-4[^"]*"/, 'Panel should be aligned to right edge');
    });

    it('should constrain panel width', () => {
      assert.match(srcHtml, /class="[^"]*w-\[340px\][^"]*"[^>]*id="medic-panel"/, 'Panel should have fixed width');
    });

    it('should constrain panel height and scroll', () => {
      const panelMatch = srcHtml.match(/<div[^>]*id="medic-panel"[^>]*>/);
      const panel = panelMatch[0];
      assert.match(panel, /class="[^"]*max-h-\[500px\][^"]*"/, 'Panel should have max-height');
      assert.match(panel, /class="[^"]*overflow-hidden[^"]*"/, 'Panel should hide overflow');
    });

    it('should allow panel body to scroll', () => {
      const bodyMatch = srcHtml.match(/<div[^>]*id="medic-panel-body"[^>]*>/);
      const body = bodyMatch[0];
      assert.match(body, /class="[^"]*overflow-y-auto[^"]*"/, 'Panel body should allow vertical scrolling');
    });
  });
});
