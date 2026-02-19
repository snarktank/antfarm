import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Project root is one level up from tests/
const projectRoot = path.resolve(import.meta.dirname, '..');
const srcFile = path.join(projectRoot, 'src/server/index.html');
const distFile = path.join(projectRoot, 'dist/server/index.html');

describe('Badge Migration - Tailwind CSS', () => {
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

    it('getBadgeClasses includes running status mapping', () => {
      assert(srcHTML.includes("'running': { bg: 'var(--accent-teal-subtle)', color: 'var(--accent-teal)' }"), 'Should map running status to teal colors');
    });

    it('getBadgeClasses includes done status mapping', () => {
      assert(srcHTML.includes("'done': { bg: 'var(--accent-green-subtle)', color: 'var(--accent-green)' }"), 'Should map done status to green colors');
    });

    it('getBadgeClasses includes completed status mapping', () => {
      assert(srcHTML.includes("'completed': { bg: 'var(--accent-green-subtle)', color: 'var(--accent-green)' }"), 'Should map completed status to green colors');
    });

    it('getBadgeClasses includes failed status mapping', () => {
      assert(srcHTML.includes("'failed': { bg: 'var(--accent-orange-subtle)', color: 'var(--accent-orange)' }"), 'Should map failed status to orange colors');
    });

    it('getBadgeClasses includes error status mapping', () => {
      assert(srcHTML.includes("'error': { bg: 'var(--accent-orange-subtle)', color: 'var(--accent-orange)' }"), 'Should map error status to orange colors');
    });

    it('getBadgeClasses includes waiting status mapping', () => {
      assert(srcHTML.includes("'waiting': { bg: 'var(--accent-muted)', color: 'var(--text-secondary)' }"), 'Should map waiting status to muted colors');
    });

    it('getBadgeClasses includes pending status mapping', () => {
      assert(srcHTML.includes("'pending': { bg: 'var(--accent-muted)', color: 'var(--text-secondary)' }"), 'Should map pending status to muted colors');
    });

    it('getBadgeClasses includes blocked status mapping', () => {
      assert(srcHTML.includes("'blocked': { bg: 'var(--accent-orange-faint)', color: 'var(--accent-orange)' }"), 'Should map blocked status to orange-faint colors');
    });

    it('getBadgeClasses returns classes and style properties', () => {
      assert(srcHTML.includes('return {'), 'Should return an object');
      assert(srcHTML.includes('classes: baseClasses'), 'Should return classes property');
      assert(srcHTML.includes('style: `background:${colors.bg};color:${colors.color}`'), 'Should return style property with CSS variables');
    });
  });

  describe('Card Badge Usage', () => {
    it('card meta uses getBadgeClasses for badge info', () => {
      assert(srcHTML.includes('const badgeInfo = getBadgeClasses(run.status)'), 'Card rendering should call getBadgeClasses with run status');
    });

    it('card badge uses Tailwind classes from badgeInfo', () => {
      assert(srcHTML.match(/<span class="\$\{badgeInfo\.classes\}"/), 'Card badge should use badgeInfo.classes');
    });

    it('card badge uses inline styles from badgeInfo', () => {
      assert(srcHTML.match(/style="\$\{badgeInfo\.style\}"/), 'Card badge should use badgeInfo.style');
    });

    it('card badge displays run status', () => {
      assert(srcHTML.match(/<span class="\$\{badgeInfo\.classes\}" style="\$\{badgeInfo\.style\}">\$\{run\.status\}<\/span>/), 'Card badge should display run status text');
    });
  });

  describe('Step Badge Usage', () => {
    it('step rendering creates badgeInfo variable', () => {
      assert(srcHTML.match(/const badgeInfo = getBadgeClasses\(st\)/), 'Step rendering should call getBadgeClasses with step status');
    });

    it('step badge uses Tailwind classes from badgeInfo', () => {
      const stepBadgeMatch = srcHTML.match(/<div class="text-\[11px\] uppercase font-semibold"><span class="\$\{badgeInfo\.classes\}"/);
      assert(stepBadgeMatch, 'Step badge should use badgeInfo.classes');
    });

    it('step badge uses inline styles from badgeInfo', () => {
      const stepBadgeMatch = srcHTML.match(/<div class="text-\[11px\] uppercase font-semibold"><span class="\$\{badgeInfo\.classes\}" style="\$\{badgeInfo\.style\}"/);
      assert(stepBadgeMatch, 'Step badge should use badgeInfo.style');
    });

    it('step badge displays step status', () => {
      const stepBadgeMatch = srcHTML.match(/<div class="text-\[11px\] uppercase font-semibold"><span class="\$\{badgeInfo\.classes\}" style="\$\{badgeInfo\.style\}">\$\{st\}<\/span>/);
      assert(stepBadgeMatch, 'Step badge should display step status text');
    });
  });

  describe('Panel Badge Usage', () => {
    it('panel meta creates runBadgeInfo variable', () => {
      assert(srcHTML.includes('const runBadgeInfo = getBadgeClasses(run.status)'), 'Panel rendering should call getBadgeClasses with run status');
    });

    it('panel badge uses Tailwind classes from runBadgeInfo', () => {
      assert(srcHTML.match(/<span class="flex items-center gap-1"><span class="\$\{runBadgeInfo\.classes\}"/), 'Panel badge should use runBadgeInfo.classes');
    });

    it('panel badge uses inline styles from runBadgeInfo', () => {
      assert(srcHTML.match(/class="\$\{runBadgeInfo\.classes\}" style="\$\{runBadgeInfo\.style\}"/), 'Panel badge should use runBadgeInfo.style');
    });

    it('panel badge displays run status', () => {
      assert(srcHTML.match(/style="\$\{runBadgeInfo\.style\}">\$\{run\.status\}<\/span>/), 'Panel badge should display run status text');
    });
  });

  describe('Story Badge Usage', () => {
    it('story rendering creates badgeInfo variable', () => {
      // Check within the stories.map function
      const storiesSection = srcHTML.match(/stories\.map\(\(s, i\) => \{[\s\S]*?\}\)\.join/);
      assert(storiesSection, 'Should have stories rendering section');
      assert(storiesSection[0].includes('const badgeInfo = getBadgeClasses(st)'), 'Story rendering should call getBadgeClasses with story status');
    });

    it('story badge uses Tailwind classes from badgeInfo', () => {
      const storiesSection = srcHTML.match(/stories\.map\(\(s, i\) => \{[\s\S]*?\}\)\.join/);
      assert(storiesSection, 'Should have stories rendering section');
      assert(storiesSection[0].match(/<div class="text-\[11px\] uppercase font-semibold"><span class="\$\{badgeInfo\.classes\}"/), 'Story badge should use badgeInfo.classes');
    });

    it('story badge uses inline styles from badgeInfo', () => {
      const storiesSection = srcHTML.match(/stories\.map\(\(s, i\) => \{[\s\S]*?\}\)\.join/);
      assert(storiesSection, 'Should have stories rendering section');
      assert(storiesSection[0].match(/class="\$\{badgeInfo\.classes\}" style="\$\{badgeInfo\.style\}"/), 'Story badge should use badgeInfo.style');
    });

    it('story badge displays story status', () => {
      const storiesSection = srcHTML.match(/stories\.map\(\(s, i\) => \{[\s\S]*?\}\)\.join/);
      assert(storiesSection, 'Should have stories rendering section');
      assert(storiesSection[0].match(/style="\$\{badgeInfo\.style\}">\$\{st\}<\/span>/), 'Story badge should display story status text');
    });
  });

  describe('CSS Removal', () => {
    it('old .badge base class is removed', () => {
      assert(!srcHTML.match(/\.badge\{font-size:10px/), 'Old .badge CSS should be removed');
    });

    it('old .badge-running class is removed', () => {
      assert(!srcHTML.includes('.badge-running{'), 'Old .badge-running CSS should be removed');
    });

    it('old .badge-done class is removed', () => {
      assert(!srcHTML.includes('.badge-done'), 'Old .badge-done CSS should be removed');
    });

    it('old .badge-completed class is removed', () => {
      assert(!srcHTML.includes('.badge-completed'), 'Old .badge-completed CSS should be removed');
    });

    it('old .badge-failed class is removed', () => {
      assert(!srcHTML.includes('.badge-failed'), 'Old .badge-failed CSS should be removed');
    });

    it('old .badge-error class is removed', () => {
      assert(!srcHTML.includes('.badge-error'), 'Old .badge-error CSS should be removed');
    });

    it('old .badge-waiting class is removed', () => {
      assert(!srcHTML.includes('.badge-waiting'), 'Old .badge-waiting CSS should be removed');
    });

    it('old .badge-pending class is removed', () => {
      assert(!srcHTML.includes('.badge-pending'), 'Old .badge-pending CSS should be removed');
    });

    it('old .badge-blocked class is removed', () => {
      assert(!srcHTML.includes('.badge-blocked'), 'Old .badge-blocked CSS should be removed');
    });

    it('badge section includes migration comment', () => {
      assert(srcHTML.includes('/* Badge styling migrated to Tailwind classes */'), 'Should have migration comment');
    });
  });

  describe('Tailwind Badge Classes', () => {
    it('uses text-[10px] for font size', () => {
      assert(srcHTML.includes("text-[10px]"), 'Should use text-[10px] for badge font size');
    });

    it('uses font-semibold for font weight', () => {
      assert(srcHTML.includes('font-semibold'), 'Should use font-semibold for badge font weight (600)');
    });

    it('uses px-1.5 for horizontal padding', () => {
      assert(srcHTML.includes('px-1.5'), 'Should use px-1.5 for badge horizontal padding (6px)');
    });

    it('uses py-0.5 for vertical padding', () => {
      assert(srcHTML.includes('py-0.5'), 'Should use py-0.5 for badge vertical padding (2px)');
    });

    it('uses rounded for border radius', () => {
      assert(srcHTML.includes('rounded'), 'Should use rounded for badge border radius (4px)');
    });

    it('uses uppercase for text transform', () => {
      assert(srcHTML.includes('uppercase'), 'Should use uppercase for badge text transform');
    });
  });

  describe('CSS Variable Preservation', () => {
    it('running badges use --accent-teal-subtle for background', () => {
      assert(srcHTML.includes("bg: 'var(--accent-teal-subtle)'"), 'Running badges should use --accent-teal-subtle background');
    });

    it('running badges use --accent-teal for text color', () => {
      assert(srcHTML.includes("color: 'var(--accent-teal)'"), 'Running badges should use --accent-teal text color');
    });

    it('done badges use --accent-green-subtle for background', () => {
      assert(srcHTML.includes("bg: 'var(--accent-green-subtle)'"), 'Done badges should use --accent-green-subtle background');
    });

    it('done badges use --accent-green for text color', () => {
      assert(srcHTML.includes("color: 'var(--accent-green)'"), 'Done badges should use --accent-green text color');
    });

    it('failed badges use --accent-orange-subtle for background', () => {
      assert(srcHTML.includes("bg: 'var(--accent-orange-subtle)'"), 'Failed badges should use --accent-orange-subtle background');
    });

    it('failed badges use --accent-orange for text color', () => {
      assert(srcHTML.includes("color: 'var(--accent-orange)'"), 'Failed badges should use --accent-orange text color');
    });

    it('pending badges use --accent-muted for background', () => {
      assert(srcHTML.includes("bg: 'var(--accent-muted)'"), 'Pending badges should use --accent-muted background');
    });

    it('pending badges use --text-secondary for text color', () => {
      assert(srcHTML.includes("color: 'var(--text-secondary)'"), 'Pending badges should use --text-secondary text color');
    });
  });

  describe('Functional Preservation', () => {
    it('badge rendering is preserved in renderBoard function', () => {
      assert(srcHTML.includes('function renderBoard(wf, runs)'), 'renderBoard function should exist');
      assert(srcHTML.includes('getBadgeClasses(run.status)'), 'renderBoard should call getBadgeClasses');
    });

    it('badge rendering is preserved in openRun function', () => {
      assert(srcHTML.includes('async function openRun(id)'), 'openRun function should exist');
      assert(srcHTML.includes('getBadgeClasses(run.status)'), 'openRun should call getBadgeClasses for run badge');
      assert(srcHTML.includes('getBadgeClasses(st)'), 'openRun should call getBadgeClasses for step badges');
    });

    it('badge rendering is preserved in loadStories function', () => {
      assert(srcHTML.includes('async function loadStories(runId)'), 'loadStories function should exist');
      assert(srcHTML.includes('getBadgeClasses(st)'), 'loadStories should call getBadgeClasses');
    });
  });

  describe('Build Output', () => {
    it('dist/server/index.html exists after build', () => {
      assert(existsSync(distFile), 'dist/server/index.html should exist (run npm run build)');
      distHTML = readFileSync(distFile, 'utf8');
    });

    it('dist HTML matches source HTML', () => {
      assert.equal(distHTML, srcHTML, 'Built HTML should match source HTML');
    });
  });
});
