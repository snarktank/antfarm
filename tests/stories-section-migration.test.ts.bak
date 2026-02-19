import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const srcHtml = resolve(projectRoot, 'src/server/index.html');
const distHtml = resolve(projectRoot, 'dist/server/index.html');

describe('Stories Section Migration (US-009)', () => {
  const html = readFileSync(srcHtml, 'utf-8');

  describe('Stories section container', () => {
    it('uses Tailwind classes for spacing and border', () => {
      assert.ok(html.includes('<div class="mt-6 border-t pt-5"'), 'Should use mt-6 border-t pt-5 classes');
    });

    it('preserves border color via CSS variable', () => {
      assert.ok(html.includes('style="border-color:var(--border)"'), 'Should preserve --border variable');
    });

    it('does not use inline styles for spacing', () => {
      const storiesSection = html.match(/async function loadStories[\s\S]*?^}/m)?.[0] || '';
      assert.ok(!storiesSection.includes('style="margin-top:24px'), 'Should not have inline margin-top');
      assert.ok(!storiesSection.includes('style="padding-top:20px'), 'Should not have inline padding-top');
    });
  });

  describe('Stories header', () => {
    it('uses flex layout classes', () => {
      assert.ok(html.includes('<div class="flex items-center justify-between mb-3">'), 'Should use flex items-center justify-between mb-3');
    });

    it('does not use inline display:flex', () => {
      const storiesSection = html.match(/async function loadStories[\s\S]*?^}/m)?.[0] || '';
      assert.ok(!storiesSection.includes('style="display:flex;align-items:center;justify-content:space-between'), 'Should not have inline flex styles');
    });
  });

  describe('Stories h3 title', () => {
    it('uses Tailwind typography classes', () => {
      assert.ok(html.includes('<h3 class="text-[15px] font-semibold"'), 'Should use text-[15px] font-semibold');
    });

    it('preserves text color via CSS variable', () => {
      const h3Match = html.match(/<h3 class="[^"]*"[^>]*>/);
      assert.ok(h3Match, 'Should have h3 element');
      assert.ok(h3Match[0].includes('style="color:var(--text-primary)"'), 'Should preserve --text-primary variable');
    });

    it('does not use inline font-size and font-weight', () => {
      const storiesSection = html.match(/async function loadStories[\s\S]*?^}/m)?.[0] || '';
      assert.ok(!storiesSection.includes('<h3 style="font-size:15px;font-weight:600'), 'Should not have inline h3 styles');
    });
  });

  describe('Done count span', () => {
    it('uses Tailwind typography classes', () => {
      assert.ok(html.includes('<span class="text-[13px] font-semibold"'), 'Should use text-[13px] font-semibold for done count');
    });

    it('preserves accent color via CSS variable', () => {
      const spanMatch = html.match(/<span class="text-\[13px\] font-semibold"[^>]*>.*done<\/span>/);
      assert.ok(spanMatch, 'Should have done count span');
      assert.ok(spanMatch[0].includes('style="color:var(--accent-green)"'), 'Should preserve --accent-green variable');
    });
  });

  describe('Progress bar container', () => {
    it('uses Tailwind classes for layout', () => {
      assert.ok(html.includes('class="rounded h-2 mb-4 overflow-hidden"'), 'Should use rounded h-2 mb-4 overflow-hidden');
    });

    it('preserves background via CSS variable', () => {
      const progressMatch = html.match(/class="rounded h-2 mb-4 overflow-hidden"[^>]*>/);
      assert.ok(progressMatch, 'Should have progress bar container');
      assert.ok(progressMatch[0].includes('style="background:var(--accent-muted)"'), 'Should preserve --accent-muted variable');
    });

    it('does not use inline height:8px', () => {
      const storiesSection = html.match(/panel\.innerHTML = `[\s\S]*?`;/)?.[0] || '';
      assert.ok(!storiesSection.includes('height:8px'), 'Should not have inline height:8px (using h-2 instead)');
    });

    it('does not use inline border-radius:4px for container', () => {
      const storiesSection = html.match(/async function loadStories[\s\S]*?^}/m)?.[0] || '';
      assert.ok(storiesSection.includes('background:var(--accent-muted)'), 'Should have progress bar');
      // Check the progress container doesn't have border-radius:4px inline (it uses rounded class instead)
      const progressContainer = storiesSection.match(/class="rounded h-2 mb-4 overflow-hidden"[^>]*>/)?.[0] || '';
      assert.ok(!progressContainer.includes('border-radius:4px'), 'Should not have inline border-radius on container (using rounded class)');
    });
  });

  describe('Progress bar fill', () => {
    it('uses Tailwind classes for height and transition', () => {
      assert.ok(html.includes('class="h-full rounded transition-[width] duration-300"'), 'Should use h-full rounded transition-[width] duration-300');
    });

    it('preserves dynamic width via inline style', () => {
      const fillMatch = html.match(/class="h-full rounded transition-\[width\] duration-300"[^>]*>/);
      assert.ok(fillMatch, 'Should have progress bar fill');
      assert.ok(fillMatch[0].includes('style="background:var(--accent-green);width:${pct}%"'), 'Should preserve dynamic width');
    });

    it('uses duration-300 for transition', () => {
      const storiesSection = html.match(/async function loadStories[\s\S]*?^}/m)?.[0] || '';
      assert.ok(storiesSection.includes('duration-300'), 'Should use duration-300 (300ms transition)');
    });

    it('does not use inline transition:width .3s', () => {
      const storiesSection = html.match(/panel\.innerHTML = `[\s\S]*?`;/)?.[0] || '';
      assert.ok(!storiesSection.includes('transition:width .3s'), 'Should not have inline transition syntax');
    });
  });

  describe('Stories list container', () => {
    it('uses flex layout classes', () => {
      assert.ok(html.includes('<div class="flex flex-col gap-1.5">'), 'Should use flex flex-col gap-1.5');
    });

    it('does not use inline flex styles', () => {
      const storiesSection = html.match(/async function loadStories[\s\S]*?^}/m)?.[0] || '';
      assert.ok(!storiesSection.includes('style="display:flex;flex-direction:column;gap:6px"'), 'Should not have inline flex styles');
    });
  });

  describe('Retry count indicator', () => {
    it('uses Tailwind text size class', () => {
      assert.ok(html.includes('retryInfo = s.retry_count > 0 ? ` <span class="text-[10px]"'), 'Should use text-[10px] for retry count');
    });

    it('preserves orange color via CSS variable', () => {
      const retryMatch = html.match(/retryInfo = s\.retry_count > 0 \?[^:]*:[^;]*/);
      assert.ok(retryMatch, 'Should have retry count logic');
      assert.ok(retryMatch[0].includes('style="color:var(--accent-orange)"'), 'Should preserve --accent-orange variable');
    });

    it('does not use inline font-size:10px', () => {
      const storiesSection = html.match(/async function loadStories[\s\S]*?^}/m)?.[0] || '';
      const retrySection = storiesSection.match(/retryInfo = s\.retry_count[^;]+;/);
      assert.ok(retrySection, 'Should have retry info');
      assert.ok(!retrySection[0].includes('font-size:10px'), 'Should not have inline font-size');
    });
  });

  describe('Story description', () => {
    it('uses Tailwind margin class', () => {
      assert.ok(html.includes('s.description ? `<div class="mb-2">'), 'Should use mb-2 for description margin');
    });

    it('does not use inline margin-bottom:8px', () => {
      const storiesSection = html.match(/async function loadStories[\s\S]*?^}/m)?.[0] || '';
      const descriptionSection = storiesSection.match(/s\.description \? `<div[^>]*>.*?<\/div>`/);
      assert.ok(descriptionSection, 'Should have description section');
      assert.ok(!descriptionSection[0].includes('style="margin-bottom:8px"'), 'Should not have inline margin on description');
    });
  });

  describe('Acceptance criteria section', () => {
    it('uses Tailwind margin class for container', () => {
      assert.ok(html.includes('ac.length > 0 ? `<div class="mb-2">'), 'Should use mb-2 for AC container');
    });

    it('uses Tailwind classes for AC header', () => {
      assert.ok(html.includes('<div class="font-semibold text-[11px] uppercase tracking-wide mb-1"'), 'Should use Tailwind classes for AC header');
    });

    it('preserves AC header color via CSS variable', () => {
      const acHeaderMatch = html.match(/<div class="font-semibold text-\[11px\] uppercase tracking-wide mb-1"[^>]*>/);
      assert.ok(acHeaderMatch, 'Should have AC header');
      assert.ok(acHeaderMatch[0].includes('style="color:var(--accent-green)"'), 'Should preserve --accent-green for AC header');
    });

    it('uses Tailwind classes for AC labels', () => {
      assert.ok(html.includes('<label class="flex items-start gap-1.5 mb-0.5 cursor-default">'), 'Should use flex items-start gap-1.5 mb-0.5 cursor-default');
    });

    it('uses shrink-0 for checkbox', () => {
      assert.ok(html.includes('<span class="shrink-0"'), 'Should use shrink-0 for checkbox span');
    });

    it('does not use inline styles for AC container and labels', () => {
      const storiesSection = html.match(/async function loadStories[\s\S]*?^}/m)?.[0] || '';
      const acSection = storiesSection.match(/Acceptance Criteria[\s\S]*?join\(''\)/);
      assert.ok(acSection, 'Should have AC section');
      assert.ok(!acSection[0].includes('style="display:flex;align-items:flex-start;gap:6px'), 'Should not have inline flex styles on labels');
      assert.ok(!acSection[0].includes('style="font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.3px'), 'Should not have inline styles on AC header');
    });
  });

  describe('CSS removal', () => {
    it('does not have old story section inline styles in template', () => {
      const storiesSection = html.match(/async function loadStories[\s\S]*?^}/m)?.[0] || '';
      assert.ok(!storiesSection.includes('margin-top:24px;border-top:1px solid'), 'Should not have old container styles');
      assert.ok(!storiesSection.includes('display:flex;align-items:center;justify-content:space-between;margin-bottom:12px'), 'Should not have old header styles');
    });

    it('updates migration comment to include stories section', () => {
      assert.ok(html.includes('stories section, and activity section migrated to Tailwind classes'), 'Should mention stories and activity in migration comment');
    });
  });

  describe('Functional preservation', () => {
    it('preserves loadStories function', () => {
      assert.ok(html.includes('async function loadStories(runId)'), 'Should have loadStories function');
      assert.ok(html.includes('const stories = await fetchJSON'), 'Should fetch stories from API');
    });

    it('preserves story status icons', () => {
      assert.ok(html.includes('const icon = stepIcons[st]'), 'Should use stepIcons for story icons');
    });

    it('preserves badge rendering', () => {
      assert.ok(html.includes('const badgeInfo = getBadgeClasses(st)'), 'Should use getBadgeClasses for story badges');
    });

    it('preserves icon styles', () => {
      assert.ok(html.includes('const iconStyles = getStepIconStyles(st)'), 'Should use getStepIconStyles for story icon colors');
    });

    it('preserves story toggle behavior', () => {
      assert.ok(html.includes("classList.toggle('story-open')"), 'Should toggle story-open class');
      assert.ok(html.includes("classList.toggle('story-chevron-open')"), 'Should toggle story-chevron-open class');
    });

    it('preserves acceptance criteria parsing', () => {
      assert.ok(html.includes('ac = JSON.parse(s.acceptance_criteria'), 'Should parse acceptance criteria JSON');
    });

    it('preserves story output rendering', () => {
      assert.ok(html.includes('s.output ? `<details'), 'Should render story output in details element');
    });

    it('preserves done/undone checkbox logic', () => {
      const storiesSection = html.match(/async function loadStories[\s\S]*?^}/m)?.[0] || '';
      assert.ok(storiesSection.includes("st==='done'?'☑':'☐'"), 'Should show checked/unchecked based on status');
    });
  });

  describe('Build output', () => {
    it('generates dist HTML file', () => {
      assert.ok(existsSync(distHtml), 'Should generate dist/server/index.html');
    });

    it('includes stories section in dist file', () => {
      if (existsSync(distHtml)) {
        const distContent = readFileSync(distHtml, 'utf-8');
        assert.ok(distContent.includes('class="mt-6 border-t pt-5"'), 'Dist file should have migrated stories container');
        assert.ok(distContent.includes('class="rounded h-2 mb-4 overflow-hidden"'), 'Dist file should have migrated progress bar');
      }
    });
  });

  describe('Responsive design', () => {
    it('uses gap-1.5 for story list spacing', () => {
      assert.ok(html.includes('gap-1.5'), 'Should use gap-1.5 (6px) for story spacing');
    });

    it('uses mb-3 for header spacing', () => {
      assert.ok(html.includes('justify-between mb-3'), 'Should use mb-3 (12px) for header bottom margin');
    });

    it('uses mb-4 for progress bar spacing', () => {
      assert.ok(html.includes('mb-4 overflow-hidden'), 'Should use mb-4 (16px) for progress bar bottom margin');
    });
  });

  describe('Transition behavior', () => {
    it('uses duration-300 for progress bar animation', () => {
      assert.ok(html.includes('transition-[width] duration-300'), 'Should use duration-300 for 300ms transition');
    });

    it('preserves dynamic width percentage', () => {
      const storiesSection = html.match(/async function loadStories[\s\S]*?^}/m)?.[0] || '';
      assert.ok(storiesSection.includes('width:${pct}%'), 'Should preserve dynamic width calculation');
    });
  });
});
