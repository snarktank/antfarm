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

    it('should use Tailwind classes for background, border, and shadow with dark mode', () => {
      const panelMatch = srcHtml.match(/<div[^>]*id="medic-panel"[^>]*>/);
      const panel = panelMatch[0];
      assert.ok(panel.includes('bg-bg-surface dark:bg-dark-bg-surface'), 'Should use Tailwind classes for background');
      assert.ok(panel.includes('border-border-default dark:border-dark-border-default'), 'Should use Tailwind classes for border');
      assert.ok(panel.includes('shadow-heavy dark:shadow-dark-heavy'), 'Should use Tailwind classes for shadow');
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

    it('should use Tailwind classes for border and text color with dark mode', () => {
      const headerRegex = /<div class="[^"]*">Workflow Medic<\/div>/;
      const headerMatch = srcHtml.match(headerRegex);
      assert.ok(headerMatch, 'Panel header element should exist');
      const header = headerMatch[0];
      assert.ok(header.includes('border-border-light dark:border-dark-border-light'), 'Should use Tailwind classes for border');
      assert.ok(header.includes('text-text-primary dark:text-dark-text-primary'), 'Should use Tailwind classes for text color');
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
      assert.ok(srcHtml.includes('py-1.5 text-xs'), 'Last stat row should have py-1.5 and text-xs without border-b');
    });

    it('should use Tailwind font-semibold for stat values', () => {
      assert.ok(srcHtml.includes('font-semibold'), 'Stat values should have font-semibold class');
    });

    it('should use Tailwind classes for text colors with dark mode', () => {
      assert.ok(srcHtml.includes('text-text-secondary dark:text-dark-text-secondary'), 'Stat labels should use Tailwind text classes');
      assert.ok(srcHtml.includes('text-text-primary dark:text-dark-text-primary'), 'Stat values should use Tailwind text classes');
    });

    it('should use Tailwind classes for border color with dark mode', () => {
      assert.ok(srcHtml.includes('border-border-light dark:border-dark-border-light'), 'Stat rows should use Tailwind border classes');
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
      assert.ok(srcHtml.includes("border-b"), 'Check rows should have border-b classes for conditional application');
    });

    it('should use Tailwind font-mono for timestamp', () => {
      assert.ok(srcHtml.includes('font-mono'), 'Timestamp should have font-mono class');
    });

    it('should use Tailwind margin (ml-2) for summary span', () => {
      assert.ok(srcHtml.includes('ml-2'), 'Summary span should have ml-2 class');
    });

    it('should use Tailwind classes for text colors with dark mode', () => {
      const loadMedicDataMatch = srcHtml.match(/async function loadMedicData\(\)[\s\S]*?^}/m);
      assert.ok(loadMedicDataMatch, 'loadMedicData function should exist');
      const functionBody = loadMedicDataMatch[0];
      assert.ok(functionBody.includes('text-text-secondary dark:text-dark-text-secondary'), 'Timestamp should use Tailwind text classes');
      assert.ok(functionBody.includes('text-accent-teal dark:text-dark-accent-teal'), 'Fixed checks should use Tailwind accent-teal classes');
      assert.ok(functionBody.includes('text-accent-orange dark:text-dark-accent-orange'), 'Issues should use Tailwind accent-orange classes');
    });

    it('should use Tailwind classes for border color with dark mode', () => {
      assert.ok(srcHtml.includes('border-border-light dark:border-dark-border-light'), 'Check rows should use Tailwind border classes');
    });
  });

  describe('Recent Checks header styling', () => {
    it('should use Tailwind typography (text-xs font-semibold)', () => {
      assert.ok(srcHtml.includes('text-xs font-semibold mb-2') && srcHtml.includes('Recent Checks'), 'Recent Checks header should have text-xs font-semibold classes');
    });

    it('should use Tailwind margin (mb-2)', () => {
      assert.ok(srcHtml.includes('text-xs font-semibold mb-2') && srcHtml.includes('Recent Checks'), 'Recent Checks header should have mb-2 class');
    });

    it('should use Tailwind classes for text color with dark mode', () => {
      assert.ok(srcHtml.includes('text-text-primary dark:text-dark-text-primary'), 'Recent Checks header should use Tailwind text classes');
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
