// tests/css-removal.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const srcHtmlPath = resolve(projectRoot, 'src/server/index.html');
const distHtmlPath = resolve(projectRoot, 'dist/server/index.html');
const outputCssPath = resolve(projectRoot, 'dist/server/output.css');
const inputCssPath = resolve(projectRoot, 'src/server/input.css');

describe('US-015: Remove all custom CSS and finalize Tailwind migration', () => {
  describe('No <style> block in index.html', () => {
    it('should not have any <style> tag in src/server/index.html', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(!html.includes('<style>'), 'Found <style> tag in source HTML');
      assert.ok(!html.includes('<style '), 'Found <style> tag with attributes in source HTML');
    });

    it('should not have any closing </style> tag in src/server/index.html', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(!html.includes('</style>'), 'Found </style> tag in source HTML');
    });

    it('should not have CSS variable declarations in index.html', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(!html.includes(':root {'), 'Found :root CSS variable block');
      assert.ok(!html.includes('[data-theme="dark"] {'), 'Found data-theme CSS block');
      assert.ok(!html.includes('--bg-page:'), 'Found CSS variable declaration');
      assert.ok(!html.includes('--text-primary:'), 'Found CSS variable declaration');
    });

    it('should not have custom CSS classes defined in index.html', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(!html.includes('/* ── Theme tokens'), 'Found theme tokens comment');
      assert.ok(!html.includes('/* ── Base '), 'Found base CSS section');
      assert.ok(!html.includes('/* ── Board '), 'Found board CSS section');
    });
  });

  describe('Tailwind CSS properly loaded', () => {
    it('should have output.css linked in index.html', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('<link href="output.css" rel="stylesheet">'), 'Missing output.css link');
    });

    it('should have output.css linked only once (no duplicates)', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      const matches = html.match(/output\.css/g);
      assert.strictEqual(matches?.length, 1, 'output.css should be linked exactly once');
    });

    it('should have output.css in the head section before </head>', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      const linkIndex = html.indexOf('<link href="output.css"');
      const headCloseIndex = html.indexOf('</head>');
      assert.ok(linkIndex < headCloseIndex && linkIndex > -1, 'output.css link should be in head section');
    });

    it('should have fonts loaded before output.css', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      const fontsIndex = html.indexOf('fonts.googleapis.com');
      const cssIndex = html.indexOf('output.css');
      assert.ok(fontsIndex < cssIndex, 'Fonts should be loaded before Tailwind CSS');
    });
  });

  describe('CSS moved to input.css and compiled to output.css', () => {
    it('should have @tailwind directives in input.css', () => {
      const css = readFileSync(inputCssPath, 'utf-8');
      assert.ok(css.includes('@tailwind base'), 'Missing @tailwind base');
      assert.ok(css.includes('@tailwind components'), 'Missing @tailwind components');
      assert.ok(css.includes('@tailwind utilities'), 'Missing @tailwind utilities');
    });

    it('should have JavaScript toggle classes in input.css', () => {
      const css = readFileSync(inputCssPath, 'utf-8');
      assert.ok(css.includes('.overlay.open'), 'Missing .overlay.open class');
      assert.ok(css.includes('.story-open'), 'Missing .story-open class');
      assert.ok(css.includes('.step-open'), 'Missing .step-open class');
      assert.ok(css.includes('.medic-panel.open'), 'Missing .medic-panel.open class');
    });

    it('should have chevron rotation classes in input.css', () => {
      const css = readFileSync(inputCssPath, 'utf-8');
      assert.ok(css.includes('.story-chevron-open'), 'Missing .story-chevron-open class');
      assert.ok(css.includes('.step-chevron-open'), 'Missing .step-chevron-open class');
      assert.ok(css.includes('transform: rotate(90deg)'), 'Missing transform rotate');
    });

    it('should have medic status dot classes in input.css', () => {
      const css = readFileSync(inputCssPath, 'utf-8');
      assert.ok(css.includes('.healthy'), 'Missing .healthy class');
      assert.ok(css.includes('.warning'), 'Missing .warning class');
      assert.ok(css.includes('.critical'), 'Missing .critical class');
      assert.ok(css.includes('.unknown'), 'Missing .unknown class');
    });

    it('should have pulse animation in input.css', () => {
      const css = readFileSync(inputCssPath, 'utf-8');
      assert.ok(css.includes('@keyframes pulse'), 'Missing pulse animation');
      assert.ok(css.includes('animation: pulse'), 'Missing animation reference');
    });

    it('should have select dropdown styling in input.css', () => {
      const css = readFileSync(inputCssPath, 'utf-8');
      assert.ok(css.includes('select option'), 'Missing select option styling');
      assert.ok(css.includes('select:focus'), 'Missing select focus styling');
    });

    it('should NOT have CSS variables in input.css', () => {
      const css = readFileSync(inputCssPath, 'utf-8');
      assert.ok(!css.includes('var(--'), 'Should not use CSS variables in input.css');
    });

    it('should have dark mode select styling in input.css', () => {
      const css = readFileSync(inputCssPath, 'utf-8');
      assert.ok(css.includes('[data-theme="dark"] select option'), 'Missing dark theme select styling');
    });
  });

  describe('Build output verification', () => {
    it('should have compiled output.css file in dist/', () => {
      assert.ok(existsSync(outputCssPath), 'dist/server/output.css does not exist');
    });

    it('should have non-empty output.css file', () => {
      const css = readFileSync(outputCssPath, 'utf-8');
      assert.ok(css.length > 1000, 'output.css is too small (might be empty or incomplete)');
    });

    it('should have Tailwind CSS in output.css', () => {
      const css = readFileSync(outputCssPath, 'utf-8');
      assert.ok(css.includes('tailwindcss'), 'Missing Tailwind CSS comment');
    });

    it('should have custom classes compiled into output.css', () => {
      const css = readFileSync(outputCssPath, 'utf-8');
      assert.ok(css.includes('.overlay.open'), 'Missing .overlay.open in compiled CSS');
      assert.ok(css.includes('.healthy'), 'Missing .healthy in compiled CSS');
      assert.ok(css.includes('pulse'), 'Missing pulse animation in compiled CSS');
    });

    it('should have dist/server/index.html copied from src/', () => {
      assert.ok(existsSync(distHtmlPath), 'dist/server/index.html does not exist');
    });

    it('should have no <style> block in dist/server/index.html', () => {
      const html = readFileSync(distHtmlPath, 'utf-8');
      assert.ok(!html.includes('<style>'), 'Found <style> tag in dist HTML');
    });
  });

  describe('HTML structure preservation', () => {
    it('should still have body with Tailwind classes', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('<body class="min-h-screen bg-bg-page dark:bg-dark-bg-page'), 'Body missing Tailwind classes');
    });

    it('should still have header with Tailwind classes', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('<header class="flex flex-wrap'), 'Header missing Tailwind classes');
    });

    it('should still have board with Tailwind classes', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('class="flex flex-col md:flex-row gap-4 p-6'), 'Board missing Tailwind classes');
    });

    it('should still have overlay with Tailwind classes', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('class="fixed inset-0 z-[100]'), 'Overlay missing Tailwind classes');
    });

    it('should still have medic panel with Tailwind classes', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('class="fixed top-[60px] right-4 w-[340px]'), 'Medic panel missing Tailwind classes');
    });
  });

  describe('JavaScript functionality preserved', () => {
    it('should have getBadgeClasses function', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('function getBadgeClasses(status)'), 'Missing getBadgeClasses function');
    });

    it('should have getStepIconClasses function', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('function getStepIconClasses(status)'), 'Missing getStepIconClasses function');
    });

    it('should have renderBoard function', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('function renderBoard(wf, runs)'), 'Missing renderBoard function');
    });

    it('should have openRun function', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('async function openRun(id)'), 'Missing openRun function');
    });

    it('should have closePanel function', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('function closePanel()'), 'Missing closePanel function');
    });

    it('should have loadStories function', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('async function loadStories(runId)'), 'Missing loadStories function');
    });

    it('should have loadActivity function', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('async function loadActivity(runId)'), 'Missing loadActivity function');
    });

    it('should have toggleMedicPanel function', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('function toggleMedicPanel()'), 'Missing toggleMedicPanel function');
    });

    it('should have loadMedicData function', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('async function loadMedicData()'), 'Missing loadMedicData function');
    });

    it('should have theme toggle initialization', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('function initTheme()'), 'Missing initTheme function');
      assert.ok(html.includes('function applyTheme(theme)'), 'Missing applyTheme function');
    });

    it('should have overlay click handler', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('onclick="if(event.target===this)closePanel()"'), 'Missing overlay click handler');
    });

    it('should have escape key handler', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('if (e.key === \'Escape\') closePanel()'), 'Missing escape key handler');
    });
  });

  describe('Dark mode support maintained', () => {
    it('should have dark mode classes on body', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('dark:bg-dark-bg-page'), 'Body missing dark mode bg class');
      assert.ok(html.includes('dark:text-dark-text-primary'), 'Body missing dark mode text class');
    });

    it('should have dark mode classes on header', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('dark:bg-dark-header-bg'), 'Header missing dark mode bg class');
      assert.ok(html.includes('dark:border-dark-header-border'), 'Header missing dark mode border class');
    });

    it('should have getBadgeClasses returning dark mode classes', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('dark:bg-dark-accent-'), 'Badge classes missing dark mode support');
      assert.ok(html.includes('dark:text-dark-accent-'), 'Badge classes missing dark mode text color');
    });

    it('should have getStepIconClasses returning dark mode classes', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      const match = html.match(/function getStepIconClasses[\s\S]*?^}/m);
      assert.ok(match, 'getStepIconClasses function not found');
      assert.ok(match[0].includes('dark:bg-dark-accent-'), 'Step icon classes missing dark mode support');
    });

    it('should have dark mode classes in renderBoard function', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      const renderBoardSection = html.substring(html.indexOf('function renderBoard'), html.indexOf('function renderBoard') + 5000);
      assert.ok(renderBoardSection.includes('dark:bg-dark-') || renderBoardSection.includes('dark:text-dark-'), 'renderBoard missing dark mode classes');
    });

    it('should have dark mode classes in openRun function', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      const match = html.match(/async function openRun[\s\S]*?panel\.innerHTML =/);
      assert.ok(match, 'openRun function not found');
      assert.ok(match[0].includes('dark:text-dark-'), 'openRun missing dark mode classes');
    });
  });

  describe('Responsive design maintained', () => {
    it('should have mobile-first responsive classes on board', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('flex-col md:flex-row'), 'Board missing responsive flex classes');
    });

    it('should have responsive width constraints on panel', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('w-[90%] max-w-[640px]'), 'Panel missing responsive width');
    });

    it('should have responsive height constraints on panel', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('max-h-[85vh]'), 'Panel missing responsive max-height');
    });

    it('should have overflow handling for long content', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('overflow-y-auto'), 'Missing overflow handling');
      assert.ok(html.includes('overflow-x-auto'), 'Missing horizontal overflow handling');
    });
  });

  describe('Accessibility and UX maintained', () => {
    it('should have theme toggle with title and aria-label', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('title="Toggle light/dark mode"'), 'Missing theme toggle title');
      assert.ok(html.includes('aria-label="Toggle light/dark mode"'), 'Missing theme toggle aria-label');
    });

    it('should have cursor-pointer on interactive elements', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('cursor-pointer'), 'Missing cursor-pointer classes');
    });

    it('should have focus styles on select', () => {
      const css = readFileSync(inputCssPath, 'utf-8');
      assert.ok(css.includes('select:focus'), 'Missing select focus styles');
    });

    it('should have transition classes for smooth interactions', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('transition-'), 'Missing transition classes');
      assert.ok(html.includes('duration-'), 'Missing duration classes');
    });
  });

  describe('File size and optimization', () => {
    it('should have smaller index.html file than before (no large CSS block)', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      const sizeKB = html.length / 1024;
      assert.ok(sizeKB < 30, `index.html is ${sizeKB.toFixed(1)}KB, expected < 30KB after CSS removal`);
    });

    it('should have minified output.css', () => {
      const css = readFileSync(outputCssPath, 'utf-8');
      // Minified CSS has no newlines between rules
      const newlineCount = (css.match(/\n/g) || []).length;
      assert.ok(newlineCount < 50, 'output.css should be minified');
    });
  });
});
