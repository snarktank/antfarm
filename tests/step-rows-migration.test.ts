import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const htmlPath = resolve(projectRoot, 'src/server/index.html');
const srcInputCSS = resolve(projectRoot, 'src/server/input.css');
const distPath = resolve(projectRoot, 'dist/server/index.html');

describe('Step Rows Migration (US-008)', () => {
  describe('getStepIconClasses helper function', () => {
    it('should define getStepIconClasses function', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      assert.ok(html.includes('function getStepIconClasses(status)'), 'getStepIconClasses function should be defined');
    });

    it('should return Tailwind classes for done status with dark mode', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const funcMatch = html.match(/function getStepIconClasses\(status\)\s*\{[\s\S]*?\n\}/);
      assert.ok(funcMatch, 'getStepIconClasses function should exist');
      assert.ok(funcMatch[0].includes("'done'"), 'should have done status mapping');
      assert.ok(funcMatch[0].includes('bg-accent-green-subtle dark:bg-dark-accent-green-subtle'), 'should use Tailwind green classes for done with dark mode');
    });

    it('should return Tailwind classes for running status with dark mode', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const funcMatch = html.match(/function getStepIconClasses\(status\)\s*\{[\s\S]*?\n\}/);
      assert.ok(funcMatch, 'getStepIconClasses function should exist');
      assert.ok(funcMatch[0].includes("'running'"), 'should have running status mapping');
      assert.ok(funcMatch[0].includes('bg-accent-teal-subtle dark:bg-dark-accent-teal-subtle'), 'should use Tailwind teal classes for running with dark mode');
    });

    it('should return Tailwind classes for pending/waiting status with dark mode', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const funcMatch = html.match(/function getStepIconClasses\(status\)\s*\{[\s\S]*?\n\}/);
      assert.ok(funcMatch[0].includes("'pending'"), 'should have pending status mapping');
      assert.ok(funcMatch[0].includes("'waiting'"), 'should have waiting status mapping');
      assert.ok(funcMatch[0].includes('bg-accent-muted dark:bg-dark-accent-muted'), 'should use Tailwind muted classes for pending/waiting with dark mode');
    });

    it('should return Tailwind classes for failed/error status with dark mode', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const funcMatch = html.match(/function getStepIconClasses\(status\)\s*\{[\s\S]*?\n\}/);
      assert.ok(funcMatch[0].includes("'failed'"), 'should have failed status mapping');
      assert.ok(funcMatch[0].includes("'error'"), 'should have error status mapping');
      assert.ok(funcMatch[0].includes('bg-accent-orange-subtle dark:bg-dark-accent-orange-subtle'), 'should use Tailwind orange classes for failed/error with dark mode');
    });
  });

  describe('Steps list container', () => {
    it('should replace .steps-list with Tailwind classes', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      assert.ok(html.includes('class="flex flex-col gap-2">${stepsHTML}'), 'steps container should use Tailwind flex classes');
    });

    it('should not have .steps-list CSS class', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      assert.ok(!html.includes('.steps-list{'), 'old .steps-list CSS should be removed');
      assert.ok(!html.includes('.steps-list {'), 'old .steps-list CSS should be removed');
    });
  });

  describe('Step row structure - steps', () => {
    it('should use Tailwind flex container classes', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const stepsSection = html.match(/const stepsHTML = \(run\.steps.*?\)\.join\(''\);/s);
      assert.ok(stepsSection, 'stepsHTML section should exist');
      assert.ok(stepsSection[0].includes('flex flex-col overflow-hidden rounded-md border p-3'), 'step row should use Tailwind flex classes');
    });

    it('should use Tailwind classes for background and border with dark mode', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const stepsSection = html.match(/const stepsHTML = \(run\.steps.*?\)\.join\(''\);/s);
      assert.ok(stepsSection[0].includes('bg-bg-surface-alt dark:bg-dark-bg-surface-alt'), 'should use Tailwind classes for background with dark mode');
      assert.ok(stepsSection[0].includes('border-border-default dark:border-dark-border-default'), 'should use Tailwind classes for border with dark mode');
    });

    it('should have inner flex container with proper spacing', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const stepsSection = html.match(/const stepsHTML = \(run\.steps.*?\)\.join\(''\);/s);
      assert.ok(stepsSection[0].includes('class="flex items-center gap-3"'), 'inner container should use flex with gap');
    });

    it('should call getStepIconClasses for icon styling', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const stepsSection = html.match(/const stepsHTML = \(run\.steps.*?\)\.join\(''\);/s);
      assert.ok(stepsSection[0].includes('const iconClasses = getStepIconClasses(st)'), 'should call getStepIconClasses');
      assert.ok(stepsSection[0].includes('${iconClasses}'), 'should apply iconClasses to icon element');
    });
  });

  describe('Step icon styling', () => {
    it('should use Tailwind classes for icon badge', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const stepsSection = html.match(/const stepsHTML = \(run\.steps.*?\)\.join\(''\);/s);
      assert.ok(stepsSection[0].includes('w-6 h-6'), 'icon should be 24x24px (w-6 h-6)');
      assert.ok(stepsSection[0].includes('rounded-full'), 'icon should be circular');
      assert.ok(stepsSection[0].includes('flex items-center justify-center'), 'icon should center content');
      assert.ok(stepsSection[0].includes('text-xs'), 'icon should use text-xs');
      assert.ok(stepsSection[0].includes('shrink-0'), 'icon should not shrink');
    });

    it('should not have .step-icon CSS class', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      assert.ok(!html.includes('.step-icon{'), 'old .step-icon CSS should be removed');
      assert.ok(!html.includes('.step-icon {'), 'old .step-icon CSS should be removed');
    });

    it('should not have .step-icon status CSS classes', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      assert.ok(!html.includes('.step-icon.done'), 'old .step-icon.done CSS should be removed');
      assert.ok(!html.includes('.step-icon.running'), 'old .step-icon.running CSS should be removed');
      assert.ok(!html.includes('.step-icon.pending'), 'old .step-icon.pending CSS should be removed');
      assert.ok(!html.includes('.step-icon.failed'), 'old .step-icon.failed CSS should be removed');
    });
  });

  describe('Step name, agent, and status', () => {
    it('should use Tailwind classes for step name', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const stepsSection = html.match(/const stepsHTML = \(run\.steps.*?\)\.join\(''\);/s);
      assert.ok(stepsSection[0].includes('text-[13px] font-medium flex-1'), 'step name should use Tailwind classes');
      assert.ok(stepsSection[0].includes('text-text-primary dark:text-dark-text-primary'), 'step name should use Tailwind color classes with dark mode');
    });

    it('should use Tailwind classes for step agent', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const stepsSection = html.match(/const stepsHTML = \(run\.steps.*?\)\.join\(''\);/s);
      assert.ok(stepsSection[0].includes('text-[11px] font-mono'), 'step agent should use Tailwind classes');
      assert.ok(stepsSection[0].includes('text-text-secondary dark:text-dark-text-secondary'), 'step agent should use Tailwind color classes with dark mode');
    });

    it('should use Tailwind classes for step status', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const stepsSection = html.match(/const stepsHTML = \(run\.steps.*?\)\.join\(''\);/s);
      assert.ok(stepsSection[0].includes('class="text-[11px] uppercase font-semibold"'), 'step status should use Tailwind classes');
    });

    it('should not have .step-name, .step-agent, .step-status CSS classes', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      assert.ok(!html.includes('.step-name{'), 'old .step-name CSS should be removed');
      assert.ok(!html.includes('.step-agent{'), 'old .step-agent CSS should be removed');
      assert.ok(!html.includes('.step-status{'), 'old .step-status CSS should be removed');
    });
  });

  describe('Step chevron and toggle behavior', () => {
    it('should use Tailwind classes for chevron', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      // Updated in US-018 to use duration-200 for consistency (200-300ms transitions)
      assert.match(html, /class="step-chevron inline-block text-\[10px\] transition-transform duration-200/);
    });

    it('should preserve step-chevron class for JS toggle', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const stepsSection = html.match(/const stepsHTML = \(run\.steps.*?\)\.join\(''\);/s);
      assert.ok(stepsSection[0].includes("querySelector('.step-chevron')"), 'should still reference step-chevron class for JS');
    });

    it('should preserve .step-chevron-open CSS for rotation', () => {
      const inputCSS = readFileSync(srcInputCSS, 'utf-8');
      assert.match(inputCSS, /\.step-chevron-open/);
      assert.match(inputCSS, /transform:\s*rotate\(90deg\)/);
    });

    it('should preserve onclick toggle handler', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const stepsSection = html.match(/const stepsHTML = \(run\.steps.*?\)\.join\(''\);/s);
      assert.ok(stepsSection[0].includes("onclick=\"this.querySelector('.step-details').classList.toggle('step-open')"), 'toggle handler should be preserved');
      assert.ok(stepsSection[0].includes("classList.toggle('step-chevron-open')"), 'chevron toggle should be preserved');
    });
  });

  describe('Step details section', () => {
    it('should use Tailwind classes for step-details', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      assert.match(html, /class="step-details hidden pt-0 pl-9 pb-0 pr-3 text-xs leading-relaxed/);
    });

    it('should preserve .step-open CSS for visibility toggle', () => {
      const inputCSS = readFileSync(srcInputCSS, 'utf-8');
      assert.match(inputCSS, /\.step-open/);
      assert.match(inputCSS, /display:\s*block/);
    });

    it('should use Tailwind classes for output pre/code block', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      assert.match(html, /class="mt-1\.5 p-2 rounded border text-\[11px\] font-mono whitespace-pre-wrap break-words max-h-\[300px\] overflow-y-auto/);
    });

    it('should use Tailwind classes for details/summary', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      // Updated in US-018 to include hover states and transitions
      assert.ok(html.includes('summary'));
      assert.ok(html.includes('text-[11px]'));
      assert.ok(html.includes('font-medium'));
      assert.ok(html.includes('cursor-pointer'));
      assert.ok(html.includes('text-text-secondary'));
    });
  });

  describe('Story rows structure', () => {
    it('should use Tailwind flex container classes for stories', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const storiesSection = html.match(/\$\{stories\.map\(\(s, i\).*?\)\.join\(''\)\}/s);
      assert.ok(storiesSection, 'stories section should exist');
      assert.ok(storiesSection[0].includes('flex flex-col overflow-hidden rounded-md border p-3'), 'story row should use Tailwind flex classes');
    });

    it('should call getStepIconClasses for story icons', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const storiesSection = html.match(/\$\{stories\.map\(\(s, i\).*?\)\.join\(''\)\}/s);
      assert.ok(storiesSection[0].includes('const iconClasses = getStepIconClasses(st)'), 'should call getStepIconClasses for stories');
      assert.ok(storiesSection[0].includes('${iconClasses}'), 'should apply iconClasses to story icon element');
    });

    it('should use same icon classes for stories as steps', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const storiesSection = html.match(/\$\{stories\.map\(\(s, i\).*?\)\.join\(''\)\}/s);
      assert.ok(storiesSection[0].includes('w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0'), 'story icon should use same Tailwind classes as step icon');
    });

    it('should use Tailwind classes for story details section', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const storiesSection = html.match(/\$\{stories\.map\(\(s, i\).*?\)\.join\(''\)\}/s);
      assert.ok(storiesSection[0].includes('story-details hidden pt-0 pl-9 pb-0 pr-3 text-xs leading-relaxed'), 'story details should use Tailwind classes');
    });

    it('should use Tailwind classes for story output', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      // Find the stories.map section and check for Tailwind classes
      const storiesStartIdx = html.indexOf('${stories.map((s, i)');
      assert.ok(storiesStartIdx > 0, 'stories.map section should exist');
      const storiesEndIdx = html.indexOf("}).join('')}", storiesStartIdx);
      const storiesSection = html.substring(storiesStartIdx, storiesEndIdx + 12);
      // Check for key Tailwind classes in story output pre
      assert.ok(storiesSection.includes('mt-1.5'), 'story output should have mt-1.5');
      assert.ok(storiesSection.includes('p-2'), 'story output should have p-2');
      assert.ok(storiesSection.includes('rounded'), 'story output should have rounded');
      assert.ok(storiesSection.includes('font-mono'), 'story output should have font-mono');
      assert.ok(storiesSection.includes('max-h-[200px]'), 'story output should have max-h-[200px]');
    });
  });

  describe('CSS removal', () => {
    it('should not have old .step-row CSS', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      assert.ok(!html.includes('.step-row{'), 'old .step-row CSS should be removed');
      assert.ok(!html.includes('.step-row {'), 'old .step-row CSS should be removed');
    });

    it('should not have <style> block in index.html (CSS moved to input.css)', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      assert.ok(!html.includes('<style>'), 'index.html should not have <style> block');
    });
  });

  describe('Functional preservation', () => {
    it('should preserve openRun function', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      assert.ok(html.includes('function openRun('), 'openRun function should be preserved');
    });

    it('should preserve loadStories function', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      assert.ok(html.includes('function loadStories('), 'loadStories function should be preserved');
    });

    it('should preserve step icon mapping', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      assert.ok(html.includes('const icon = stepIcons[st]'), 'step icon mapping should be preserved');
    });

    it('should preserve badge rendering', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const stepsSection = html.match(/const stepsHTML = \(run\.steps.*?\)\.join\(''\);/s);
      assert.ok(stepsSection[0].includes('const badgeInfo = getBadgeClasses(st)'), 'badge rendering should be preserved');
    });
  });

  describe('Build output', () => {
    it('should have dist HTML file', () => {
      assert.ok(existsSync(distPath), 'dist/server/index.html should exist after build');
    });

    it('should match source step structure in dist', () => {
      const srcHTML = readFileSync(htmlPath, 'utf-8');
      const distHTML = readFileSync(distPath, 'utf-8');
      const srcSteps = srcHTML.match(/const stepsHTML = \(run\.steps.*?\)\.join\(''\);/s);
      const distSteps = distHTML.match(/const stepsHTML = \(run\.steps.*?\)\.join\(''\);/s);
      assert.ok(srcSteps, 'source should have stepsHTML section');
      assert.ok(distSteps, 'dist should have stepsHTML section');
      assert.ok(srcSteps[0].includes('flex flex-col overflow-hidden'), 'source should use Tailwind classes');
      assert.ok(distSteps[0].includes('flex flex-col overflow-hidden'), 'dist should use Tailwind classes');
    });
  });

  describe('Responsive design', () => {
    it('should use flex-1 for flexible step name width', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const stepsSection = html.match(/const stepsHTML = \(run\.steps.*?\)\.join\(''\);/s);
      assert.ok(stepsSection[0].includes('flex-1'), 'step name should use flex-1 for flexible width');
    });

    it('should use shrink-0 for icon to prevent shrinking', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const stepsSection = html.match(/const stepsHTML = \(run\.steps.*?\)\.join\(''\);/s);
      assert.ok(stepsSection[0].includes('shrink-0'), 'icon should not shrink on narrow screens');
    });

    it('should use proper gap spacing between elements', () => {
      const html = readFileSync(htmlPath, 'utf-8');
      const stepsSection = html.match(/const stepsHTML = \(run\.steps.*?\)\.join\(''\);/s);
      assert.ok(stepsSection[0].includes('gap-3'), 'should use gap-3 for element spacing');
    });
  });
});
