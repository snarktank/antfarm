import { describe, it } from "node:test";
import { strict as assert } from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const indexHtmlPath = path.join(projectRoot, "src", "server", "index.html");
const distHtmlPath = path.join(projectRoot, "dist", "server", "index.html");

describe("Activity Section Migration", () => {
  const html = readFileSync(indexHtmlPath, "utf-8");

  describe("Activity Section Container", () => {
    it("should have mt-6 class for top margin", () => {
      assert.match(html, /class="mt-6 border-t pt-5 border-border-default dark:border-dark-border-default"/);
    });

    it("should have border-t class for top border", () => {
      assert.match(html, /class="mt-6 border-t pt-5 border-border-default dark:border-dark-border-default"/);
    });

    it("should have pt-5 class for top padding", () => {
      assert.match(html, /class="mt-6 border-t pt-5 border-border-default dark:border-dark-border-default"/);
    });

    it("should have Tailwind border color classes", () => {
      assert.match(
        html,
        /border-border-default dark:border-dark-border-default/
      );
    });

    it("should not have inline margin-top style", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?panel\.innerHTML = `[\s\S]*?`;[\s\S]*?}/
      );
      assert.ok(loadActivityMatch);
      assert.ok(!loadActivityMatch[0].includes('margin-top:24px'));
    });

    it("should not have inline padding-top style", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?panel\.innerHTML = `[\s\S]*?`;[\s\S]*?}/
      );
      assert.ok(loadActivityMatch);
      assert.ok(!loadActivityMatch[0].includes('padding-top:20px'));
    });
  });

  describe("Activity Heading (h3)", () => {
    it("should have text-[15px] class for font size", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?panel\.innerHTML = `[\s\S]*?`;[\s\S]*?}/
      );
      assert.ok(loadActivityMatch);
      assert.ok(loadActivityMatch[0].includes('text-[15px]'), 'h3 should have text-[15px] class');
    });

    it("should have font-semibold class for font weight", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?panel\.innerHTML = `[\s\S]*?`;[\s\S]*?}/
      );
      assert.ok(loadActivityMatch);
      assert.ok(loadActivityMatch[0].includes('font-semibold'), 'h3 should have font-semibold class');
    });

    it("should have mb-3 class for bottom margin", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?panel\.innerHTML = `[\s\S]*?`;[\s\S]*?}/
      );
      assert.ok(loadActivityMatch);
      assert.ok(loadActivityMatch[0].includes('mb-3'), 'h3 should have mb-3 class');
    });

    it("should have Tailwind text color classes", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?panel\.innerHTML = `[\s\S]*?`;[\s\S]*?}/
      );
      assert.ok(loadActivityMatch);
      assert.match(
        loadActivityMatch[0],
        /text-text-primary dark:text-dark-text-primary/
      );
    });

    it("should not have inline font-size style", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?panel\.innerHTML = `[\s\S]*?`;[\s\S]*?}/
      );
      assert.ok(loadActivityMatch);
      assert.ok(!loadActivityMatch[0].includes('font-size:15px'));
    });

    it("should not have inline font-weight style", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?panel\.innerHTML = `[\s\S]*?`;[\s\S]*?}/
      );
      assert.ok(loadActivityMatch);
      assert.ok(!loadActivityMatch[0].includes('font-weight:600'));
    });

    it("should not have inline margin-bottom style", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?panel\.innerHTML = `[\s\S]*?`;[\s\S]*?}/
      );
      assert.ok(loadActivityMatch);
      assert.ok(!loadActivityMatch[0].includes('margin-bottom:12px'));
    });
  });

  describe("Events Container", () => {
    it("should have max-h-[300px] class for max height", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?panel\.innerHTML = `[\s\S]*?`;[\s\S]*?}/
      );
      assert.ok(loadActivityMatch);
      assert.match(loadActivityMatch[0], /<div class="max-h-\[300px\] overflow-y-auto">/);
    });

    it("should have overflow-y-auto class for scrolling", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?panel\.innerHTML = `[\s\S]*?`;[\s\S]*?}/
      );
      assert.ok(loadActivityMatch);
      assert.match(loadActivityMatch[0], /<div class="max-h-\[300px\] overflow-y-auto">/);
    });

    it("should not have inline max-height style", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?panel\.innerHTML = `[\s\S]*?`;[\s\S]*?}/
      );
      assert.ok(loadActivityMatch);
      assert.ok(!loadActivityMatch[0].includes('max-height:300px'));
    });

    it("should not have inline overflow-y style", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?panel\.innerHTML = `[\s\S]*?`;[\s\S]*?}/
      );
      assert.ok(loadActivityMatch);
      assert.ok(!loadActivityMatch[0].includes('overflow-y:auto'));
    });
  });

  describe("Event Row Structure", () => {
    it("should have flex class for display flex", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(loadActivityMatch[0].includes('class="flex'), 'event row should have flex class');
    });

    it("should have gap-3 class for gap", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(loadActivityMatch[0].includes('gap-3'), 'event row should have gap-3 class');
    });

    it("should have py-1 class for vertical padding", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(loadActivityMatch[0].includes('py-1'), 'event row should have py-1 class');
    });

    it("should have text-xs class for font size", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(loadActivityMatch[0].includes('text-xs'), 'event row should have text-xs class');
    });

    it("should have leading-normal class for line height", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(loadActivityMatch[0].includes('leading-normal'), 'event row should have leading-normal class');
    });

    it("should have border-b class for border bottom", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(loadActivityMatch[0].includes('border-b'), 'event row should have border-b class');
    });

    it("should have Tailwind border color classes", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      assert.match(
        loadActivityMatch[0],
        /border-border-light dark:border-dark-border-light/
      );
    });

    it("should not have inline display:flex style", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(!loadActivityMatch[0].includes('display:flex'));
    });

    it("should not have inline gap style", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(!loadActivityMatch[0].includes('gap:12px'));
    });

    it("should not have inline padding style", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(!loadActivityMatch[0].includes('padding:4px 0'));
    });

    it("should not have inline font-size style", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(!loadActivityMatch[0].includes('font-size:12px'));
    });

    it("should not have inline line-height style", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(!loadActivityMatch[0].includes('line-height:1.5'));
    });
  });

  describe("Timestamp Span", () => {
    it("should have font-mono class for monospace font", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(loadActivityMatch[0].includes('font-mono'), 'timestamp should have font-mono class');
    });

    it("should have shrink-0 class to prevent shrinking", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(loadActivityMatch[0].includes('shrink-0'), 'timestamp should have shrink-0 class');
    });

    it("should have min-w-[44px] class for minimum width", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(loadActivityMatch[0].includes('min-w-[44px]'), 'timestamp should have min-w-[44px] class');
    });

    it("should have Tailwind text color classes", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      assert.match(
        loadActivityMatch[0],
        /text-text-secondary dark:text-dark-text-secondary/
      );
    });

    it("should not have inline font-family style", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      const timestampMatch = loadActivityMatch[0].match(
        /<span[^>]*>\${time}<\/span>/
      );
      assert.ok(timestampMatch);
      assert.ok(!timestampMatch[0].includes("font-family:'Geist Mono',monospace"));
    });

    it("should not have inline flex-shrink style", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      const timestampMatch = loadActivityMatch[0].match(
        /<span[^>]*>\${time}<\/span>/
      );
      assert.ok(timestampMatch);
      assert.ok(!timestampMatch[0].includes('flex-shrink:0'));
    });

    it("should not have inline min-width style", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      const timestampMatch = loadActivityMatch[0].match(
        /<span[^>]*>\${time}<\/span>/
      );
      assert.ok(timestampMatch);
      assert.ok(!timestampMatch[0].includes('min-width:44px'));
    });
  });

  describe("Agent Span", () => {
    it("should have font-mono class for monospace font", () => {
      const loadActivityMatch = html.match(
        /const agentSpan = agent[\s\S]*?;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(loadActivityMatch[0].includes('font-mono'), 'agent should have font-mono class');
    });

    it("should have shrink-0 class to prevent shrinking", () => {
      const loadActivityMatch = html.match(
        /const agentSpan = agent[\s\S]*?;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(loadActivityMatch[0].includes('shrink-0'), 'agent should have shrink-0 class');
    });

    it("should have Tailwind accent color classes", () => {
      const loadActivityMatch = html.match(
        /const agentSpan = agent[\s\S]*?;/
      );
      assert.ok(loadActivityMatch);
      assert.match(
        loadActivityMatch[0],
        /text-accent-teal dark:text-dark-accent-teal/
      );
    });

    it("should not have inline font-family style", () => {
      const loadActivityMatch = html.match(
        /const agentSpan = agent[\s\S]*?;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(!loadActivityMatch[0].includes("font-family:'Geist Mono',monospace"));
    });

    it("should not have inline flex-shrink style", () => {
      const loadActivityMatch = html.match(
        /const agentSpan = agent[\s\S]*?;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(!loadActivityMatch[0].includes('flex-shrink:0'));
    });
  });

  describe("Description Span", () => {
    it("should have Tailwind text color classes", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(loadActivityMatch[0].includes('text-text-primary dark:text-dark-text-primary'), 'description should have dark mode text color classes');
    });

    it("should not have inline style attribute", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      const descMatch = loadActivityMatch[0].match(
        /<span[^>]*>\${esc\(desc\)}<\/span>/
      );
      assert.ok(descMatch);
      // Should not have inline style attribute, only class
      assert.match(descMatch[0], /class="/);
      assert.ok(!descMatch[0].includes('style='));
    });
  });

  describe("CSS Removal", () => {
    it("should not have old inline styles in activity container", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?panel\.innerHTML = `[\s\S]*?`;[\s\S]*?}/
      );
      assert.ok(loadActivityMatch);
      assert.ok(!loadActivityMatch[0].includes('margin-top:24px'));
      assert.ok(!loadActivityMatch[0].includes('padding-top:20px'));
    });

    it("should not have old inline styles in heading", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?panel\.innerHTML = `[\s\S]*?`;[\s\S]*?}/
      );
      assert.ok(loadActivityMatch);
      assert.ok(!loadActivityMatch[0].includes('font-size:15px'));
      assert.ok(!loadActivityMatch[0].includes('font-weight:600'));
      assert.ok(!loadActivityMatch[0].includes('margin-bottom:12px'));
    });

    it("should not have old inline styles in events container", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?panel\.innerHTML = `[\s\S]*?`;[\s\S]*?}/
      );
      assert.ok(loadActivityMatch);
      assert.ok(!loadActivityMatch[0].includes('max-height:300px'));
      assert.ok(!loadActivityMatch[0].includes('overflow-y:auto'));
    });

    it("should not have old inline styles in event rows", () => {
      const loadActivityMatch = html.match(
        /async function loadActivity[\s\S]*?return `<div[\s\S]*?<\/div>`;/
      );
      assert.ok(loadActivityMatch);
      assert.ok(!loadActivityMatch[0].includes('display:flex'));
      assert.ok(!loadActivityMatch[0].includes('gap:12px'));
      assert.ok(!loadActivityMatch[0].includes('padding:4px 0'));
      assert.ok(!loadActivityMatch[0].includes('font-size:12px'));
      assert.ok(!loadActivityMatch[0].includes('line-height:1.5'));
    });

    it("should have updated migration comment", () => {
      assert.match(
        html,
        /\/\* Overlay, panel container, panel header, close button, step rows, stories section, and activity section migrated to Tailwind classes \*\//
      );
    });
  });

  describe("Functional Preservation", () => {
    it("should preserve loadActivity function", () => {
      assert.match(html, /async function loadActivity\(runId\) {/);
    });

    it("should preserve fetchJSON call for events", () => {
      assert.match(
        html,
        /const events = await fetchJSON\(`\/api\/runs\/\${runId}\/events`\);/
      );
    });

    it("should preserve empty state handling", () => {
      assert.ok(html.includes("if (!events || events.length === 0) { panel.innerHTML = ''; return; }"));
    });

    it("should preserve event mapping logic", () => {
      assert.ok(html.includes("const rows = events.map(evt => {"));
    });

    it("should preserve time formatting", () => {
      assert.ok(html.includes("const time = t.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});"));
    });

    it("should preserve agent ID extraction", () => {
      assert.ok(html.includes("const agent = evt.agentId ? evt.agentId.split('/').pop() : '';"));
    });

    it("should preserve formatEventDesc call", () => {
      assert.ok(html.includes("const desc = formatEventDesc(evt);"));
    });

    it("should preserve escape function calls", () => {
      assert.ok(html.includes("${esc(agent)}"));
      assert.ok(html.includes("${esc(desc)}"));
    });

    it("should preserve activity-panel element ID", () => {
      assert.match(html, /id="activity-panel"/);
    });
  });

  describe("Build Output", () => {
    it("should have dist HTML file after build", () => {
      assert.ok(existsSync(distHtmlPath), "dist/server/index.html should exist");
    });

    it("should have migrated activity section in dist HTML", () => {
      if (existsSync(distHtmlPath)) {
        const distHtml = readFileSync(distHtmlPath, "utf-8");
        assert.ok(distHtml.includes('mt-6 border-t pt-5 border-border-default dark:border-dark-border-default'));
        assert.ok(distHtml.includes('text-[15px] font-semibold mb-3'));
        assert.ok(distHtml.includes('max-h-[300px] overflow-y-auto'));
      }
    });
  });

  describe("Responsive Design", () => {
    it("should use proper spacing classes for mobile", () => {
      assert.ok(html.includes("gap-3")); // 12px gap
      assert.ok(html.includes("py-1")); // 4px vertical padding
    });

    it("should use proper text size for mobile readability", () => {
      assert.ok(html.includes("text-xs")); // 12px font size
      assert.ok(html.includes("text-[15px]")); // 15px heading
    });

    it("should use overflow-y-auto for scrolling on small screens", () => {
      assert.ok(html.includes("overflow-y-auto"));
      assert.ok(html.includes("max-h-[300px]"));
    });
  });
});
