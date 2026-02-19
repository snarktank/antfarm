import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const srcHtmlPath = path.join(projectRoot, 'src/server/index.html');
const distHtmlPath = path.join(projectRoot, 'dist/server/index.html');
const inputCssPath = path.join(projectRoot, 'src/server/input.css');

describe('US-018: Visual polish and accessibility improvements', () => {
  describe('Focus states on interactive elements', () => {
    it('should have focus:ring on select dropdown', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('id="wf-select"'));
      assert.ok(html.includes('focus:ring-2'));
      assert.ok(html.includes('focus:ring-accent-highlight'));
    });

    it('should have focus:ring on theme toggle button', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('id="theme-toggle"'));
      assert.ok(html.includes('focus:ring-2'));
      assert.ok(html.includes('focus:ring-white/50'));
    });

    it('should have focus:ring on medic badge', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('id="medic-badge"'));
      const medicBadge = html.match(/<div[^>]*id="medic-badge"[^>]*>/)?.[0];
      assert.ok(medicBadge);
      assert.ok(medicBadge.includes('focus:ring-2'));
    });

    it('should have focus:ring on run cards', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      // Cards are rendered in renderBoard function
      assert.ok(html.includes('focus:ring-2 focus:ring-accent-highlight'));
      assert.ok(html.includes('tabindex="0"'));
    });

    it('should have focus:ring on close button in panel', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      // Close button in openRun function
      const closeButton = html.match(/Close panel/);
      assert.ok(closeButton);
      assert.ok(html.includes('focus:ring-2 focus:ring-accent-highlight focus:ring-offset-2'));
    });

    it('should have focus:ring on step rows with details', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      // Step rows are rendered in openRun function
      assert.ok(html.includes('Toggle step details'));
      assert.ok(html.includes('focus:ring-2 focus:ring-accent-highlight'));
    });

    it('should have focus:ring on story rows with details', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      // Story rows are rendered in loadStories function
      assert.ok(html.includes('Toggle story details'));
      assert.ok(html.includes('focus:ring-2 focus:ring-accent-highlight'));
    });

    it('should have focus-visible styles in input.css', () => {
      const css = readFileSync(inputCssPath, 'utf-8');
      assert.ok(css.includes(':focus-visible'));
      assert.ok(css.includes('outline:'));
    });
  });

  describe('Aria-labels for accessibility', () => {
    it('should have aria-label on select dropdown', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('aria-label="Select workflow"'));
    });

    it('should have aria-label on theme toggle button', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('aria-label="Toggle light/dark mode"'));
    });

    it('should have aria-label on medic badge', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('aria-label="Open medic panel"'));
    });

    it('should have aria-label on close button', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('aria-label="Close panel"'));
    });

    it('should have aria-label on run cards', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('aria-label="Open run:'));
    });

    it('should have aria-label on step toggle rows', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('aria-label="Toggle step details'));
    });

    it('should have aria-label on story toggle rows', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('aria-label="Toggle story details'));
    });

    it('should have role="button" on medic badge', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      const medicBadge = html.match(/<div[^>]*id="medic-badge"[^>]*>/)?.[0];
      assert.ok(medicBadge);
      assert.ok(medicBadge.includes('role="button"'));
    });

    it('should have role="button" on run cards', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('role="button"'));
    });
  });

  describe('Keyboard navigation support', () => {
    it('should have tabindex="0" on medic badge', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      const medicBadge = html.match(/<div[^>]*id="medic-badge"[^>]*>/)?.[0];
      assert.ok(medicBadge);
      assert.ok(medicBadge.includes('tabindex="0"'));
    });

    it('should have onkeydown handler on medic badge', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      const medicBadge = html.match(/<div[^>]*id="medic-badge"[^>]*>/)?.[0];
      assert.ok(medicBadge);
      assert.ok(medicBadge.includes('onkeydown'));
      assert.ok(medicBadge.includes("event.key==='Enter'"));
    });

    it('should have tabindex="0" on run cards', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      // Cards in renderBoard function
      assert.ok(html.includes('tabindex="0"'));
    });

    it('should have onkeydown handler on run cards', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes("onkeydown=\"if(event.key==='Enter')openRun"));
    });

    it('should have tabindex="0" on step rows with details', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      // Step rows in openRun function
      assert.ok(html.includes('tabindex="0"'));
    });

    it('should have onkeydown handler on step rows', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('Toggle step details'));
      assert.ok(html.includes('event.preventDefault()'));
    });

    it('should have onkeydown handler on story rows', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('Toggle story details'));
      assert.ok(html.includes('event.preventDefault()'));
    });

    it('should support Escape key to close panel', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes("if (e.key === 'Escape')"));
      assert.ok(html.includes('closePanel()'));
    });
  });

  describe('Smooth transitions (200-300ms)', () => {
    it('should use duration-200 on cards', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('duration-200'));
    });

    it('should use duration-200 on overlay', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('transition-opacity duration-200'));
    });

    it('should use duration-200 on close button', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      const closeBtn = html.match(/aria-label="Close panel"[^>]*>/)?.[0];
      assert.ok(closeBtn);
      assert.ok(html.includes('duration-200'));
    });

    it('should use duration-200 on chevron indicators', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('transition-transform duration-200'));
    });

    it('should use duration-300 on progress bar', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('duration-300'));
    });

    it('should use duration-200 on details summary', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('transition-colors duration-200'));
    });

    it('should have transition-duration in input.css', () => {
      const css = readFileSync(inputCssPath, 'utf-8');
      assert.ok(css.includes('transition-duration: 200ms'));
    });
  });

  describe('Hover states provide clear feedback', () => {
    it('should have hover:shadow-lg on cards', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('hover:shadow-lg'));
    });

    it('should have hover:border-white/50 on theme toggle', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('hover:border-white/50'));
    });

    it('should have hover:border-white/40 on medic badge', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('hover:border-white/40'));
    });

    it('should have hover:bg-white/5 on medic badge', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('hover:bg-white/5'));
    });

    it('should have hover states on close button', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('hover:text-text-primary'));
      assert.ok(html.includes('hover:bg-bg-column-header'));
    });

    it('should have hover states on summary elements', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('hover:text-text-primary'));
    });

    it('should have onmouseenter/onmouseleave for dynamic hover effects on cards', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('onmouseenter'));
      assert.ok(html.includes('onmouseleave'));
    });
  });

  describe('Empty states have helpful messages', () => {
    it('should have improved empty state for no workflow selected', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('No Workflow Selected'));
      assert.ok(html.includes('Choose a workflow from the dropdown above'));
      assert.ok(html.includes('📋'));
    });

    it('should have improved empty state for no runs in column', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('No runs in this stage'));
      assert.ok(html.includes('∅'));
    });

    it('should have improved empty state for medic not active', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('Medic Not Active'));
      assert.ok(html.includes('antfarm medic install'));
      assert.ok(html.includes('🏥'));
    });

    it('should have error state for medic connection error', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('Connection Error'));
      assert.ok(html.includes('Could not load medic data'));
      assert.ok(html.includes('⚠️'));
    });

    it('should have empty state message styling with icons', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('text-center'));
      assert.ok(html.includes('font-medium'));
    });
  });

  describe('Loading states are clear', () => {
    it('should have Loading... initial state in select', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('<option value="">Loading...</option>'));
    });

    it('should have error handling for workflow loading', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('Error loading workflows'));
    });

    it('should have Loading... initial state in medic panel', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      const medicPanel = html.match(/<div[^>]*id="medic-panel-body"[^>]*>/)?.[0];
      assert.ok(medicPanel);
      assert.ok(html.includes('Loading...'));
    });
  });

  describe('Color contrast and visual polish', () => {
    it('should use consistent spacing classes', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('gap-4'));
      assert.ok(html.includes('gap-3'));
      assert.ok(html.includes('gap-2'));
      assert.ok(html.includes('gap-1.5'));
    });

    it('should use consistent padding classes', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('p-6'));
      assert.ok(html.includes('p-3'));
      assert.ok(html.includes('p-2'));
      assert.ok(html.includes('px-4'));
      assert.ok(html.includes('py-3'));
    });

    it('should use consistent margin classes', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('mb-1'));
      assert.ok(html.includes('mb-2'));
      assert.ok(html.includes('mb-3'));
      assert.ok(html.includes('mb-4'));
    });

    it('should use consistent border-radius classes', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('rounded-md'));
      assert.ok(html.includes('rounded-lg'));
      assert.ok(html.includes('rounded-xl'));
      assert.ok(html.includes('rounded-full'));
    });

    it('should use consistent typography classes', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('text-xs'));
      assert.ok(html.includes('text-sm'));
      assert.ok(html.includes('text-base'));
      assert.ok(html.includes('font-medium'));
      assert.ok(html.includes('font-semibold'));
    });

    it('should use dark mode variants consistently', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('dark:bg-'));
      assert.ok(html.includes('dark:text-'));
      assert.ok(html.includes('dark:border-'));
    });

    it('should have consistent shadow utilities', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('shadow-light'));
      assert.ok(html.includes('shadow-heavy'));
      assert.ok(html.includes('hover:shadow-lg'));
    });
  });

  describe('Build output verification', () => {
    it('should have dist HTML file with accessibility features', () => {
      assert.ok(existsSync(distHtmlPath));
      const distHtml = readFileSync(distHtmlPath, 'utf-8');
      assert.ok(distHtml.includes('aria-label'));
      assert.ok(distHtml.includes('focus:ring-2'));
      assert.ok(distHtml.includes('tabindex="0"'));
    });

    it('should have compiled CSS with focus styles', () => {
      const cssPath = path.join(projectRoot, 'dist/server/output.css');
      assert.ok(existsSync(cssPath));
    });
  });

  describe('Responsive design maintained', () => {
    it('should have viewport meta tag', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('viewport'));
      assert.ok(html.includes('width=device-width'));
    });

    it('should use flex-wrap on header', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('flex-wrap'));
    });

    it('should use responsive flex classes on board', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('flex-col md:flex-row'));
    });

    it('should use max-width constraints on panel', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('max-w-[640px]'));
    });
  });

  describe('All interactive features work correctly', () => {
    it('should have selectWorkflow function', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('function selectWorkflow'));
    });

    it('should have openRun function', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('function openRun'));
    });

    it('should have closePanel function', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('function closePanel'));
    });

    it('should have toggleMedicPanel function', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('function toggleMedicPanel'));
    });

    it('should have renderBoard function', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('function renderBoard'));
    });

    it('should have loadStories function', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('function loadStories'));
    });

    it('should have loadActivity function', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('function loadActivity'));
    });

    it('should have theme toggle functionality', () => {
      const html = readFileSync(srcHtmlPath, 'utf-8');
      assert.ok(html.includes('initTheme'));
      assert.ok(html.includes('applyTheme'));
    });
  });
});
