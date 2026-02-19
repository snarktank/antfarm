import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const srcPath = resolve(projectRoot, 'src/server/index.html');
const distPath = resolve(projectRoot, 'dist/server/index.html');

describe('US-012: Medic badge indicator migration', () => {
  const srcHtml = readFileSync(srcPath, 'utf-8');

  describe('Medic badge structure', () => {
    it('should have flex layout with Tailwind classes', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*flex[^"]*"/);
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*items-center[^"]*"/);
    });

    it('should have gap spacing', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*gap-1\.5[^"]*"/);
    });

    it('should have text size class', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*text-xs[^"]*"/);
    });

    it('should have text color with opacity', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*text-white\/85[^"]*"/);
    });

    it('should have cursor pointer', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*cursor-pointer[^"]*"/);
    });

    it('should have padding classes', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*px-2\.5[^"]*"/);
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*py-1[^"]*"/);
    });

    it('should have border with color and opacity', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*border[^"]*"/);
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*border-white\/15[^"]*"/);
    });

    it('should have rounded corners', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*rounded-md[^"]*"/);
    });

    it('should have transparent background', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*bg-transparent[^"]*"/);
    });

    it('should have transition-all class', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*transition-all[^"]*"/);
    });

    it('should have hover border color effect', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*hover:border-white\/40[^"]*"/);
    });

    it('should have hover background effect', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*hover:bg-white\/5[^"]*"/);
    });

    it('should not have .medic-badge CSS class', () => {
      assert.doesNotMatch(srcHtml, /id="medic-badge"[^>]*class="[^"]*medic-badge[^"]*"/);
    });

    it('should not have inline styles', () => {
      const badgeMatch = srcHtml.match(/<div[^>]*id="medic-badge"[^>]*>/);
      assert.ok(badgeMatch, 'medic-badge element should exist');
      assert.doesNotMatch(badgeMatch[0], /style=/);
    });

    it('should preserve onclick handler', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*onclick="toggleMedicPanel\(\)"/);
    });

    it('should preserve title attribute', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*title="Medic watchdog status"/);
    });
  });

  describe('Medic dot structure', () => {
    it('should have w-2 h-2 sizing classes (8px)', () => {
      assert.match(srcHtml, /id="medic-dot"[^>]*class="[^"]*w-2[^"]*"/);
      assert.match(srcHtml, /id="medic-dot"[^>]*class="[^"]*h-2[^"]*"/);
    });

    it('should have rounded-full class', () => {
      assert.match(srcHtml, /id="medic-dot"[^>]*class="[^"]*rounded-full[^"]*"/);
    });

    it('should have shrink-0 class', () => {
      assert.match(srcHtml, /id="medic-dot"[^>]*class="[^"]*shrink-0[^"]*"/);
    });

    it('should not have .medic-dot CSS class in HTML', () => {
      assert.doesNotMatch(srcHtml, /id="medic-dot"[^>]*class="[^"]*medic-dot[^"]*"/);
    });

    it('should not have inline styles', () => {
      const dotMatch = srcHtml.match(/<span[^>]*id="medic-dot"[^>]*>/);
      assert.ok(dotMatch, 'medic-dot element should exist');
      assert.doesNotMatch(dotMatch[0], /style=/);
    });
  });

  describe('Status classes CSS', () => {
    it('should have .healthy status class with green color', () => {
      assert.match(srcHtml, /\.healthy\{[^}]*background:#4ade80[^}]*\}/);
    });

    it('should have .healthy with green glow shadow', () => {
      assert.match(srcHtml, /\.healthy\{[^}]*box-shadow:0 0 6px rgba\(74,222,128,\.5\)[^}]*\}/);
    });

    it('should have .healthy with pulse animation (2s)', () => {
      assert.match(srcHtml, /\.healthy\{[^}]*animation:pulse 2s infinite[^}]*\}/);
    });

    it('should have .warning status class with yellow color', () => {
      assert.match(srcHtml, /\.warning\{[^}]*background:#fbbf24[^}]*\}/);
    });

    it('should have .warning with yellow glow shadow', () => {
      assert.match(srcHtml, /\.warning\{[^}]*box-shadow:0 0 6px rgba\(251,191,36,\.5\)[^}]*\}/);
    });

    it('should have .critical status class with red color', () => {
      assert.match(srcHtml, /\.critical\{[^}]*background:#f87171[^}]*\}/);
    });

    it('should have .critical with red glow shadow', () => {
      assert.match(srcHtml, /\.critical\{[^}]*box-shadow:0 0 6px rgba\(248,113,113,\.5\)[^}]*\}/);
    });

    it('should have .critical with pulse animation (1s)', () => {
      assert.match(srcHtml, /\.critical\{[^}]*animation:pulse 1s infinite[^}]*\}/);
    });

    it('should have .unknown status class with gray color', () => {
      assert.match(srcHtml, /\.unknown\{[^}]*background:#9ca3af[^}]*\}/);
    });

    it('should preserve @keyframes pulse definition', () => {
      assert.match(srcHtml, /@keyframes pulse\{0%,100%\{opacity:1\}50%\{opacity:\.5\}\}/);
    });
  });

  describe('CSS removal', () => {
    it('should not have .medic-badge base CSS rule', () => {
      assert.doesNotMatch(srcHtml, /\.medic-badge\{[^}]*display:flex[^}]*\}/);
    });

    it('should not have .medic-badge:hover old CSS rule', () => {
      assert.doesNotMatch(srcHtml, /\.medic-badge:hover\{/);
    });

    it('should not have .medic-dot base CSS rule', () => {
      assert.doesNotMatch(srcHtml, /\.medic-dot\{[^}]*width:8px[^}]*\}/);
    });

    it('should not have .medic-dot.healthy prefixed class', () => {
      assert.doesNotMatch(srcHtml, /\.medic-dot\.healthy\{/);
    });

    it('should not have .medic-dot.warning prefixed class', () => {
      assert.doesNotMatch(srcHtml, /\.medic-dot\.warning\{/);
    });

    it('should not have .medic-dot.critical prefixed class', () => {
      assert.doesNotMatch(srcHtml, /\.medic-dot\.critical\{/);
    });

    it('should not have .medic-dot.unknown prefixed class', () => {
      assert.doesNotMatch(srcHtml, /\.medic-dot\.unknown\{/);
    });

    it('should have updated migration comment', () => {
      assert.match(srcHtml, /Theme toggle and medic badge migrated to Tailwind classes/);
    });
  });

  describe('JavaScript functionality', () => {
    it('should have loadMedicStatus function', () => {
      assert.match(srcHtml, /async function loadMedicStatus\(\)/);
    });

    it('should have toggleMedicPanel function', () => {
      assert.match(srcHtml, /function toggleMedicPanel\(\)/);
    });

    it('should use classList.remove for status classes', () => {
      assert.match(srcHtml, /dot\.classList\.remove\('unknown', 'healthy', 'warning', 'critical'\)/);
    });

    it('should use classList.add for unknown status', () => {
      assert.match(srcHtml, /dot\.classList\.add\('unknown'\)/);
    });

    it('should use classList.add for healthy status', () => {
      assert.match(srcHtml, /dot\.classList\.add\('healthy'\)/);
    });

    it('should use classList.add for warning status', () => {
      assert.match(srcHtml, /dot\.classList\.add\('warning'\)/);
    });

    it('should use classList.add for critical status', () => {
      assert.match(srcHtml, /dot\.classList\.add\('critical'\)/);
    });

    it('should preserve label text updates', () => {
      assert.match(srcHtml, /label\.textContent = 'Medic'/);
      assert.match(srcHtml, /label\.textContent = `\$\{status\.lastCheck\.issuesFound\} issue\(s\)`/);
    });

    it('should preserve fetchJSON call', () => {
      assert.match(srcHtml, /await fetchJSON\('\/api\/medic\/status'\)/);
    });

    it('should preserve medic badge and label elements', () => {
      assert.match(srcHtml, /getElementById\('medic-badge'\)/);
      assert.match(srcHtml, /getElementById\('medic-dot'\)/);
      assert.match(srcHtml, /getElementById\('medic-label'\)/);
    });
  });

  describe('Build output', () => {
    it('should copy migrated HTML to dist/', () => {
      assert.ok(existsSync(distPath), 'dist/server/index.html should exist');
    });

    it('should have medic badge with Tailwind classes in dist', () => {
      const distHtml = readFileSync(distPath, 'utf-8');
      assert.match(distHtml, /id="medic-badge"[^>]*class="[^"]*flex items-center[^"]*"/);
      assert.match(distHtml, /id="medic-badge"[^>]*class="[^"]*hover:border-white\/40[^"]*"/);
    });
  });

  describe('Responsive design', () => {
    it('should maintain flex layout for badge', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*flex[^"]*"/);
    });

    it('should have proper spacing with gap-1.5', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*gap-1\.5[^"]*"/);
    });

    it('should maintain dot size at 8px (w-2 h-2)', () => {
      assert.match(srcHtml, /id="medic-dot"[^>]*class="[^"]*w-2 h-2[^"]*"/);
    });
  });

  describe('Hover effects', () => {
    it('should have hover transition', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*transition-all[^"]*"/);
    });

    it('should have hover border color change', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*hover:border-white\/40[^"]*"/);
    });

    it('should have hover background change', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*hover:bg-white\/5[^"]*"/);
    });

    it('should have cursor pointer for click affordance', () => {
      assert.match(srcHtml, /id="medic-badge"[^>]*class="[^"]*cursor-pointer[^"]*"/);
    });
  });

  describe('Pulse animation', () => {
    it('should have pulse keyframes for healthy status', () => {
      assert.match(srcHtml, /@keyframes pulse/);
      assert.match(srcHtml, /\.healthy\{[^}]*animation:pulse 2s infinite[^}]*\}/);
    });

    it('should have pulse animation for critical status', () => {
      assert.match(srcHtml, /\.critical\{[^}]*animation:pulse 1s infinite[^}]*\}/);
    });

    it('should not have pulse for warning status', () => {
      const warningMatch = srcHtml.match(/\.warning\{[^}]+\}/);
      assert.ok(warningMatch, '.warning class should exist');
      assert.doesNotMatch(warningMatch[0], /animation:pulse/);
    });

    it('should not have pulse for unknown status', () => {
      const unknownMatch = srcHtml.match(/\.unknown\{[^}]+\}/);
      assert.ok(unknownMatch, '.unknown class should exist');
      assert.doesNotMatch(unknownMatch[0], /animation:pulse/);
    });
  });
});
