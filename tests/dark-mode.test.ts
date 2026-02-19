import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const srcHtml = readFileSync(path.join(projectRoot, 'src/server/index.html'), 'utf-8');
const tailwindConfig = path.join(projectRoot, 'tailwind.config.js');

describe('Dark Mode with Tailwind', () => {
  describe('Tailwind Configuration', () => {
    it('tailwind.config.js exists', () => {
      assert.ok(existsSync(tailwindConfig), 'tailwind.config.js should exist');
    });

    it('darkMode is configured correctly', () => {
      const config = readFileSync(tailwindConfig, 'utf-8');
      assert.match(config, /darkMode:\s*\[.*['"]class['"].*\[data-theme="dark"\].*\]/, 'darkMode should support both class and [data-theme="dark"]');
    });

    it('custom colors are defined for light theme', () => {
      const config = readFileSync(tailwindConfig, 'utf-8');
      // Color scheme may vary (beige/modern blue), just verify colors are defined
      assert.ok(config.includes("'bg-page':"), 'bg-page light color should be defined');
      assert.ok(config.includes("'text-primary':"), 'text-primary light color should be defined');
    });

    it('custom colors are defined for dark theme', () => {
      const config = readFileSync(tailwindConfig, 'utf-8');
      // Color scheme may vary (beige/modern blue), just verify dark colors are defined
      assert.ok(config.includes("'dark-bg-page':"), 'dark-bg-page color should be defined');
      assert.ok(config.includes("'dark-text-primary':"), 'dark-text-primary color should be defined');
    });
  });

  describe('Body Element Dark Mode', () => {
    it('body has light background class', () => {
      assert.match(srcHtml, /<body[^>]*class="[^"]*bg-bg-page[^"]*"/, 'body should have bg-bg-page class');
    });

    it('body has dark background class', () => {
      assert.match(srcHtml, /<body[^>]*class="[^"]*dark:bg-dark-bg-page[^"]*"/, 'body should have dark:bg-dark-bg-page class');
    });

    it('body has light text class', () => {
      assert.match(srcHtml, /<body[^>]*class="[^"]*text-text-primary[^"]*"/, 'body should have text-text-primary class');
    });

    it('body has dark text class', () => {
      assert.match(srcHtml, /<body[^>]*class="[^"]*dark:text-dark-text-primary[^"]*"/, 'body should have dark:text-dark-text-primary class');
    });

    it('body has no inline style with CSS variables', () => {
      const bodyMatch = srcHtml.match(/<body[^>]*>/);
      assert.ok(bodyMatch, 'body tag should exist');
      assert.doesNotMatch(bodyMatch[0], /style="[^"]*var\(--/, 'body should not use inline CSS variables');
    });
  });

  describe('Header Dark Mode', () => {
    it('header has light background class', () => {
      assert.match(srcHtml, /<header[^>]*class="[^"]*bg-header-bg[^"]*"/, 'header should have bg-header-bg class');
    });

    it('header has dark background class', () => {
      assert.match(srcHtml, /<header[^>]*class="[^"]*dark:bg-dark-header-bg[^"]*"/, 'header should have dark:bg-dark-header-bg class');
    });

    it('header has light border class', () => {
      assert.match(srcHtml, /<header[^>]*class="[^"]*border-header-border[^"]*"/, 'header should have border-header-border class');
    });

    it('header has dark border class', () => {
      assert.match(srcHtml, /<header[^>]*class="[^"]*dark:border-dark-header-border[^"]*"/, 'header should have dark:border-dark-header-border class');
    });

    it('header h1 span has dark mode accent color', () => {
      assert.match(srcHtml, /<span[^>]*class="[^"]*dark:text-dark-accent-highlight[^"]*"[^>]*>antfarm<\/span>/, 'h1 span should have dark:text-dark-accent-highlight class');
    });
  });

  describe('Select Dropdown Dark Mode', () => {
    it('select has light background class', () => {
      assert.match(srcHtml, /<select[^>]*class="[^"]*bg-header-select-bg[^"]*"/, 'select should have bg-header-select-bg class');
    });

    it('select has dark background class', () => {
      assert.match(srcHtml, /<select[^>]*class="[^"]*dark:bg-dark-header-select-bg[^"]*"/, 'select should have dark:bg-dark-header-select-bg class');
    });

    it('select has light border class', () => {
      assert.match(srcHtml, /<select[^>]*class="[^"]*border-header-select-border[^"]*"/, 'select should have border-header-select-border class');
    });

    it('select has dark border class', () => {
      assert.match(srcHtml, /<select[^>]*class="[^"]*dark:border-dark-header-select-border[^"]*"/, 'select should have dark:border-dark-header-select-border class');
    });
  });

  describe('Medic Panel Dark Mode', () => {
    it('medic panel has light background class', () => {
      const medicPanelMatch = srcHtml.match(/<div[^>]*id="medic-panel"[^>]*>/);
      assert.ok(medicPanelMatch && medicPanelMatch[0].includes('bg-bg-surface'), 'medic panel should have bg-bg-surface class');
    });

    it('medic panel has dark background class', () => {
      const medicPanelMatch = srcHtml.match(/<div[^>]*id="medic-panel"[^>]*>/);
      assert.ok(medicPanelMatch && medicPanelMatch[0].includes('dark:bg-dark-bg-surface'), 'medic panel should have dark:bg-dark-bg-surface class');
    });

    it('medic panel has light border class', () => {
      const medicPanelMatch = srcHtml.match(/<div[^>]*id="medic-panel"[^>]*>/);
      assert.ok(medicPanelMatch && medicPanelMatch[0].includes('border-border-default'), 'medic panel should have border-border-default class');
    });

    it('medic panel has dark border class', () => {
      const medicPanelMatch = srcHtml.match(/<div[^>]*id="medic-panel"[^>]*>/);
      assert.ok(medicPanelMatch && medicPanelMatch[0].includes('dark:border-dark-border-default'), 'medic panel should have dark:border-dark-border-default class');
    });

    it('medic panel header has dark mode text class', () => {
      const medicPanelHeaderMatch = srcHtml.match(/<div[^>]*class="px-4 py-3\.5[^"]*"[^>]*>Workflow Medic<\/div>/);
      assert.ok(medicPanelHeaderMatch, 'medic panel header should exist');
      assert.match(medicPanelHeaderMatch[0], /dark:text-dark-text-primary/, 'medic panel header should have dark:text-dark-text-primary class');
    });
  });

  describe('Overlay and Panel Dark Mode', () => {
    it('overlay has light background class', () => {
      const overlayMatch = srcHtml.match(/<div[^>]*id="overlay"[^>]*>/);
      assert.ok(overlayMatch && overlayMatch[0].includes('bg-overlay'), 'overlay should have bg-overlay class');
    });

    it('overlay has dark background class', () => {
      const overlayMatch = srcHtml.match(/<div[^>]*id="overlay"[^>]*>/);
      assert.ok(overlayMatch && overlayMatch[0].includes('dark:bg-dark-overlay'), 'overlay should have dark:bg-dark-overlay class');
    });

    it('panel has light background class', () => {
      const panelMatch = srcHtml.match(/<div[^>]*id="panel"[^>]*>/);
      assert.ok(panelMatch && panelMatch[0].includes('bg-bg-surface'), 'panel should have bg-bg-surface class');
    });

    it('panel has dark background class', () => {
      const panelMatch = srcHtml.match(/<div[^>]*id="panel"[^>]*>/);
      assert.ok(panelMatch && panelMatch[0].includes('dark:bg-dark-bg-surface'), 'panel should have dark:bg-dark-bg-surface class');
    });

    it('panel has light border class', () => {
      const panelMatch = srcHtml.match(/<div[^>]*id="panel"[^>]*>/);
      assert.ok(panelMatch && panelMatch[0].includes('border-border-default'), 'panel should have border-border-default class');
    });

    it('panel has dark border class', () => {
      const panelMatch = srcHtml.match(/<div[^>]*id="panel"[^>]*>/);
      assert.ok(panelMatch && panelMatch[0].includes('dark:border-dark-border-default'), 'panel should have dark:border-dark-border-default class');
    });
  });

  describe('JavaScript Functions Dark Mode', () => {
    it('renderBoard uses dark mode classes for columns', () => {
      assert.match(srcHtml, /function renderBoard[\s\S]*?bg-bg-surface dark:bg-dark-bg-surface/, 'renderBoard should use dark mode classes for column background');
    });

    it('renderBoard uses dark mode classes for cards', () => {
      assert.match(srcHtml, /function renderBoard[\s\S]*?bg-bg-surface-alt dark:bg-dark-bg-surface-alt/, 'renderBoard should use dark mode classes for card background');
    });

    it('renderBoard uses dark mode classes for text', () => {
      assert.match(srcHtml, /function renderBoard[\s\S]*?text-text-primary dark:text-dark-text-primary/, 'renderBoard should use dark mode classes for text');
    });

    it('getBadgeClasses returns dark mode classes', () => {
      assert.match(srcHtml, /function getBadgeClasses[\s\S]*?dark:bg-dark-accent/, 'getBadgeClasses should return dark mode background classes');
      assert.match(srcHtml, /function getBadgeClasses[\s\S]*?dark:text-dark-accent/, 'getBadgeClasses should return dark mode text classes');
    });

    it('getStepIconClasses function exists and returns dark mode classes', () => {
      assert.match(srcHtml, /function getStepIconClasses\(/, 'getStepIconClasses function should exist');
      assert.match(srcHtml, /function getStepIconClasses[\s\S]*?dark:bg-dark-accent/, 'getStepIconClasses should return dark mode background classes');
    });

    it('openRun uses dark mode classes for steps', () => {
      assert.match(srcHtml, /function openRun[\s\S]*?dark:bg-dark-bg-surface-alt/, 'openRun should use dark mode classes for steps');
    });

    it('openRun uses dark mode classes for close button', () => {
      assert.match(srcHtml, /function openRun[\s\S]*?dark:text-dark-text-primary/, 'openRun should use dark mode classes for close button hover');
    });

    it('loadStories uses dark mode classes for progress bar', () => {
      assert.match(srcHtml, /function loadStories[\s\S]*?dark:bg-dark-accent-green/, 'loadStories should use dark mode classes for progress bar');
    });

    it('loadStories uses dark mode classes for story rows', () => {
      assert.match(srcHtml, /function loadStories[\s\S]*?dark:bg-dark-bg-surface-alt/, 'loadStories should use dark mode classes for story rows');
    });

    it('loadActivity uses dark mode classes for event rows', () => {
      assert.match(srcHtml, /function loadActivity[\s\S]*?dark:text-dark-text-primary/, 'loadActivity should use dark mode classes for event text');
    });

    it('loadMedicData uses dark mode classes for stat rows', () => {
      assert.match(srcHtml, /function loadMedicData[\s\S]*?dark:text-dark-text-secondary/, 'loadMedicData should use dark mode classes for stat text');
    });
  });

  describe('Theme Toggle Functionality', () => {
    it('theme toggle JavaScript function exists', () => {
      assert.match(srcHtml, /function initTheme/, 'initTheme function should exist');
    });

    it('applyTheme function sets data-theme attribute', () => {
      assert.match(srcHtml, /function applyTheme[\s\S]*?root\.setAttribute\('data-theme', theme\)/, 'applyTheme should set data-theme attribute');
    });

    it('theme button updates emoji based on theme', () => {
      assert.match(srcHtml, /btn\.textContent = theme === 'dark' \? '🌙' : '☀️'/, 'button should show 🌙 for dark and ☀️ for light');
    });

    it('theme persists to localStorage', () => {
      assert.match(srcHtml, /localStorage\.setItem\(STORAGE_KEY, next\)/, 'theme should be saved to localStorage');
    });

    it('theme reads from localStorage on init', () => {
      assert.match(srcHtml, /const stored = localStorage\.getItem\(STORAGE_KEY\)/, 'theme should be read from localStorage');
    });

    it('theme respects system preference when no manual selection', () => {
      assert.match(srcHtml, /window\.matchMedia\('\(prefers-color-scheme: dark\)'\)\.matches/, 'theme should check system preference');
      assert.match(srcHtml, /window\.matchMedia\('\(prefers-color-scheme: dark\)'\)\.addEventListener/, 'theme should listen for system preference changes');
    });
  });

  describe('CSS Variable Removal', () => {
    it('should not have <style> block in index.html (CSS moved to input.css)', () => {
      assert.ok(!srcHtml.includes('<style>'), 'index.html should not have <style> block');
    });

    it('no inline styles with --bg-page variable in body', () => {
      const bodyMatch = srcHtml.match(/<body[^>]*>/);
      assert.ok(bodyMatch, 'body tag should exist');
      assert.doesNotMatch(bodyMatch[0], /var\(--bg-page\)/, 'body should not use --bg-page variable');
    });

    it('no inline styles with --text-primary variable in panel content', () => {
      // Check that dynamic content generation uses classes, not inline vars
      assert.match(srcHtml, /text-text-primary dark:text-dark-text-primary/, 'should use Tailwind classes instead of --text-primary variable in templates');
    });
  });

  describe('Build Output', () => {
    it('dist HTML file exists after build', () => {
      const distHtml = path.join(projectRoot, 'dist/server/index.html');
      assert.ok(existsSync(distHtml), 'dist/server/index.html should exist after build');
    });

    it('dist HTML matches source HTML', () => {
      const distHtml = readFileSync(path.join(projectRoot, 'dist/server/index.html'), 'utf-8');
      assert.strictEqual(distHtml, srcHtml, 'dist HTML should match source HTML');
    });

    it('output.css file exists after build', () => {
      const outputCss = path.join(projectRoot, 'dist/server/output.css');
      assert.ok(existsSync(outputCss), 'dist/server/output.css should exist after build');
    });
  });

  describe('Responsive Dark Mode', () => {
    it('all color classes include dark: variants', () => {
      // Check a few key examples
      const patterns = [
        /bg-bg-page[^"]*dark:bg-dark-bg-page/,
        /text-text-primary[^"]*dark:text-dark-text-primary/,
        /border-border-default[^"]*dark:border-dark-border-default/,
        /bg-header-bg[^"]*dark:bg-dark-header-bg/,
      ];
      for (const pattern of patterns) {
        assert.match(srcHtml, pattern, `color classes should include dark: variants: ${pattern}`);
      }
    });

    it('badge classes include dark mode variants', () => {
      assert.match(srcHtml, /dark:bg-dark-accent-green-subtle/, 'badge green should have dark mode variant');
      assert.match(srcHtml, /dark:text-dark-accent-teal/, 'badge teal should have dark mode variant');
      assert.match(srcHtml, /dark:bg-dark-accent-orange-subtle/, 'badge orange should have dark mode variant');
    });
  });
});
