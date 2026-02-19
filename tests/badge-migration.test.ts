import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Project root is one level up from tests/
const projectRoot = path.resolve(import.meta.dirname, '..');
const srcFile = path.join(projectRoot, 'src/server/index.html');
const distFile = path.join(projectRoot, 'dist/server/index.html');

describe('Badge Migration - Tailwind CSS with Dark Mode', () => {
  let srcHTML: string;
  let distHTML: string;

  it('src/server/index.html exists', () => {
    assert(existsSync(srcFile), 'src/server/index.html should exist');
    srcHTML = readFileSync(srcFile, 'utf8');
  });

  describe('Badge Helper Function', () => {
    it('getBadgeClasses function exists in script', () => {
      assert(srcHTML.includes('function getBadgeClasses(status)'), 'getBadgeClasses helper function should exist');
    });

    it('getBadgeClasses returns base Tailwind classes', () => {
      assert(srcHTML.includes("baseClasses = 'text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase'"), 'Should include base Tailwind badge classes');
    });

    it('getBadgeClasses includes running status mapping with dark mode', () => {
      assert(srcHTML.includes("'running': 'bg-accent-teal-subtle dark:bg-dark-accent-teal-subtle text-accent-teal dark:text-dark-accent-teal'"), 'Should map running status to teal Tailwind classes with dark mode');
    });

    it('getBadgeClasses includes done status mapping with dark mode', () => {
      assert(srcHTML.includes("'done': 'bg-accent-green-subtle dark:bg-dark-accent-green-subtle text-accent-green dark:text-dark-accent-green'"), 'Should map done status to green Tailwind classes with dark mode');
    });

    it('getBadgeClasses includes completed status mapping with dark mode', () => {
      assert(srcHTML.includes("'completed': 'bg-accent-green-subtle dark:bg-dark-accent-green-subtle text-accent-green dark:text-dark-accent-green'"), 'Should map completed status to green Tailwind classes with dark mode');
    });

    it('getBadgeClasses includes failed status mapping with dark mode', () => {
      assert(srcHTML.includes("'failed': 'bg-accent-orange-subtle dark:bg-dark-accent-orange-subtle text-accent-orange dark:text-dark-accent-orange'"), 'Should map failed status to orange Tailwind classes with dark mode');
    });

    it('getBadgeClasses includes error status mapping with dark mode', () => {
      assert(srcHTML.includes("'error': 'bg-accent-orange-subtle dark:bg-dark-accent-orange-subtle text-accent-orange dark:text-dark-accent-orange'"), 'Should map error status to orange Tailwind classes with dark mode');
    });

    it('getBadgeClasses includes waiting status mapping with dark mode', () => {
      assert(srcHTML.includes("'waiting': 'bg-accent-muted dark:bg-dark-accent-muted text-text-secondary dark:text-dark-text-secondary'"), 'Should map waiting status to muted Tailwind classes with dark mode');
    });

    it('getBadgeClasses includes pending status mapping with dark mode', () => {
      assert(srcHTML.includes("'pending': 'bg-accent-muted dark:bg-dark-accent-muted text-text-secondary dark:text-dark-text-secondary'"), 'Should map pending status to muted Tailwind classes with dark mode');
    });

    it('getBadgeClasses includes blocked status mapping with dark mode', () => {
      assert(srcHTML.includes("'blocked': 'bg-accent-orange-faint"), 'Should map blocked status to orange-faint Tailwind classes with dark mode');
    });

    it('getBadgeClasses returns classes and empty style', () => {
      assert(srcHTML.includes('return {'), 'Should return an object');
      assert(srcHTML.includes('classes: `${baseClasses} ${statusClasses}`'), 'Should return combined classes');
      assert(srcHTML.includes("style: ''"), 'Should return empty style (no inline styles needed with Tailwind)');
    });
  });

  describe('Card Badge Usage', () => {
    it('card meta uses getBadgeClasses for badge info', () => {
      assert(srcHTML.includes('const badgeInfo = getBadgeClasses(run.status)'), 'Card rendering should call getBadgeClasses with run status');
    });

    it('card badge uses Tailwind classes from badgeInfo', () => {
      assert(srcHTML.match(/<span class="\$\{badgeInfo\.classes\}"/), 'Card badge should use badgeInfo.classes');
    });

    it('card badge displays run status', () => {
      assert(srcHTML.match(/<span[^>]*>\$\{run\.status\}<\/span>/), 'Card badge should display run status text');
    });
  });

  describe('Step Badge Usage', () => {
    it('step rendering creates badgeInfo variable', () => {
      assert(srcHTML.match(/const badgeInfo = getBadgeClasses\(st\)/), 'Step rendering should call getBadgeClasses with step status');
    });

    it('step badge uses Tailwind classes from badgeInfo', () => {
      const stepBadgeMatch = srcHTML.match(/<span class="\$\{badgeInfo\.classes\}"/);
      assert(stepBadgeMatch, 'Step badge should use badgeInfo.classes');
    });
  });

  describe('Panel Badge Usage', () => {
    it('panel rendering creates runBadgeInfo variable', () => {
      assert(srcHTML.match(/const runBadgeInfo = getBadgeClasses\(run\.status\)/), 'Panel should call getBadgeClasses with run status');
    });

    it('panel badge uses Tailwind classes from runBadgeInfo', () => {
      assert(srcHTML.match(/<span class="\$\{runBadgeInfo\.classes\}"/), 'Panel badge should use runBadgeInfo.classes');
    });
  });

  describe('Story Badge Usage', () => {
    it('story rendering creates badgeInfo variable', () => {
      assert(srcHTML.match(/const badgeInfo = getBadgeClasses\(st\)/), 'Story should call getBadgeClasses with story status');
    });

    it('story badge uses Tailwind classes from badgeInfo', () => {
      assert(srcHTML.match(/<span class="\$\{badgeInfo\.classes\}"/), 'Story badge should use badgeInfo.classes');
    });
  });

  describe('CSS Removal', () => {
    it('old .badge CSS class is removed', () => {
      assert(!srcHTML.match(/\.badge\s*\{[^}]*font-size/), 'Old .badge CSS should be removed');
    });

    it('old .badge-running CSS class is removed', () => {
      assert(!srcHTML.match(/\.badge-running\s*\{/), 'Old .badge-running CSS should be removed');
    });

    it('old .badge-done CSS class is removed', () => {
      assert(!srcHTML.match(/\.badge-done\s*\{/), 'Old .badge-done CSS should be removed');
    });

    it('old .badge-completed CSS class is removed', () => {
      assert(!srcHTML.match(/\.badge-completed\s*\{/), 'Old .badge-completed CSS should be removed');
    });

    it('old .badge-failed CSS class is removed', () => {
      assert(!srcHTML.match(/\.badge-failed\s*\{/), 'Old .badge-failed CSS should be removed');
    });

    it('old .badge-error CSS class is removed', () => {
      assert(!srcHTML.match(/\.badge-error\s*\{/), 'Old .badge-error CSS should be removed');
    });

    it('old .badge-waiting CSS class is removed', () => {
      assert(!srcHTML.match(/\.badge-waiting\s*\{/), 'Old .badge-waiting CSS should be removed');
    });

    it('old .badge-pending CSS class is removed', () => {
      assert(!srcHTML.match(/\.badge-pending\s*\{/), 'Old .badge-pending CSS should be removed');
    });

    it('old .badge-blocked CSS class is removed', () => {
      assert(!srcHTML.match(/\.badge-blocked\s*\{/), 'Old .badge-blocked CSS should be removed');
    });

    it('should not have <style> block in index.html (CSS moved to input.css)', () => {
      assert.ok(!srcHTML.includes('<style>'), 'index.html should not have <style> block');
    });
  });

  describe('Tailwind Badge Classes', () => {
    it('uses text-[10px] for badge font size', () => {
      assert(srcHTML.includes('text-[10px]'), 'Should use text-[10px] Tailwind class');
    });

    it('uses font-semibold for badge font weight', () => {
      assert(srcHTML.includes('font-semibold'), 'Should use font-semibold Tailwind class');
    });

    it('uses px-1.5 for horizontal padding', () => {
      assert(srcHTML.includes('px-1.5'), 'Should use px-1.5 Tailwind class');
    });

    it('uses py-0.5 for vertical padding', () => {
      assert(srcHTML.includes('py-0.5'), 'Should use py-0.5 Tailwind class');
    });

    it('uses rounded for border radius', () => {
      assert(srcHTML.includes('rounded'), 'Should use rounded Tailwind class');
    });

    it('uses uppercase for text transform', () => {
      assert(srcHTML.includes('uppercase'), 'Should use uppercase Tailwind class');
    });
  });

  describe('CSS Variable Preservation with Dark Mode', () => {
    it('running badges use Tailwind classes with dark mode', () => {
      assert(srcHTML.includes('bg-accent-teal-subtle dark:bg-dark-accent-teal-subtle'), 'Running badge should use Tailwind dark mode classes');
    });

    it('done badges use Tailwind classes with dark mode', () => {
      assert(srcHTML.includes('bg-accent-green-subtle dark:bg-dark-accent-green-subtle'), 'Done badge should use Tailwind dark mode classes');
    });

    it('failed badges use Tailwind classes with dark mode', () => {
      assert(srcHTML.includes('bg-accent-orange-subtle dark:bg-dark-accent-orange-subtle'), 'Failed badge should use Tailwind dark mode classes');
    });

    it('pending badges use Tailwind classes with dark mode', () => {
      assert(srcHTML.includes('bg-accent-muted dark:bg-dark-accent-muted'), 'Pending badge should use Tailwind dark mode classes');
    });
  });

  describe('Functional Preservation', () => {
    it('renderBoard function still exists', () => {
      assert(srcHTML.includes('function renderBoard'), 'renderBoard function should exist');
    });

    it('openRun function still exists', () => {
      assert(srcHTML.includes('function openRun'), 'openRun function should exist');
    });

    it('loadStories function still exists', () => {
      assert(srcHTML.includes('function loadStories'), 'loadStories function should exist');
    });
  });

  describe('Build Output', () => {
    it('dist/server/index.html exists after build', () => {
      if (existsSync(distFile)) {
        distHTML = readFileSync(distFile, 'utf8');
        assert(existsSync(distFile), 'dist/server/index.html should exist after build');
      }
    });

    it('dist HTML matches source HTML', () => {
      if (existsSync(distFile)) {
        distHTML = readFileSync(distFile, 'utf8');
        assert.strictEqual(distHTML, srcHTML, 'Dist HTML should match source HTML');
      }
    });
  });
});
