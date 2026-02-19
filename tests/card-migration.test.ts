import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const srcFile = resolve(projectRoot, "src/server/index.html");
const distFile = resolve(projectRoot, "dist/server/index.html");

describe("Card component migration", () => {
  const srcHTML = readFileSync(srcFile, "utf-8");

  describe("Card structure with Tailwind classes", () => {
    it("should have migration comment for card CSS", () => {
      assert.match(srcHTML, /Card styling migrated to Tailwind classes/);
    });

    it("should have removed old .card CSS rule", () => {
      assert.doesNotMatch(srcHTML, /\.card\{background:var\(--bg-surface-alt\)/);
    });

    it("should have removed old .card:hover CSS rule", () => {
      assert.doesNotMatch(srcHTML, /\.card:hover\{border-color:var\(--accent-orange\)/);
    });

    it("should have removed old .card-title CSS rule", () => {
      assert.doesNotMatch(srcHTML, /\.card-title\{font-size:13px/);
    });

    it("should have removed old .card-meta CSS rule", () => {
      assert.doesNotMatch(srcHTML, /\.card-meta\{font-size:11px/);
    });

    it("should have removed old .card.done CSS rule", () => {
      assert.doesNotMatch(srcHTML, /\.card\.done\{border-left:3px solid/);
    });

    it("should have removed old .card.failed/.error CSS rule", () => {
      assert.doesNotMatch(srcHTML, /\.card\.failed,\.card\.error\{border-left:3px/);
    });

    it("should use Tailwind rounded-md class for card border radius", () => {
      assert.match(srcHTML, /class="rounded-md border p-3 cursor-pointer/);
    });

    it("should use Tailwind p-3 class for card padding", () => {
      assert.match(srcHTML, /rounded-md border p-3 cursor-pointer/);
    });

    it("should use Tailwind cursor-pointer class for card", () => {
      assert.match(srcHTML, /cursor-pointer transition-all duration-150/);
    });

    it("should use Tailwind transition-all duration-150 for card transitions", () => {
      assert.match(srcHTML, /transition-all duration-150 hover:shadow-lg/);
    });

    it("should use Tailwind hover:shadow-lg for card hover effect", () => {
      assert.match(srcHTML, /hover:shadow-lg/);
    });

    it("should use Tailwind classes for background with dark mode", () => {
      assert.match(srcHTML, /bg-bg-surface-alt dark:bg-dark-bg-surface-alt/);
    });

    it("should use Tailwind classes for border color with dark mode", () => {
      assert.match(srcHTML, /border-border-default dark:border-dark-border-default/);
    });

    it("should use onmouseenter for hover border color change", () => {
      assert.match(srcHTML, /onmouseenter="this\.style\.borderColor='var\(--accent-orange\)'"/);
    });

    it("should use onmouseleave to reset border classes", () => {
      assert.match(srcHTML, /onmouseleave="this\.classList\.remove\('border-accent-orange'\)/);
    });
  });

  describe("Card title styling", () => {
    it("should use Tailwind text-[13px] for card title", () => {
      assert.match(srcHTML, /class="text-\[13px\] font-medium mb-1\.5/);
    });

    it("should use Tailwind font-medium for card title", () => {
      assert.match(srcHTML, /text-\[13px\] font-medium mb-1\.5/);
    });

    it("should use Tailwind mb-1.5 for card title margin", () => {
      assert.match(srcHTML, /font-medium mb-1\.5 overflow-hidden/);
    });

    it("should use Tailwind overflow-hidden for card title", () => {
      assert.match(srcHTML, /mb-1\.5 overflow-hidden text-ellipsis whitespace-nowrap/);
    });

    it("should use Tailwind text-ellipsis for card title truncation", () => {
      assert.match(srcHTML, /overflow-hidden text-ellipsis whitespace-nowrap/);
    });

    it("should use Tailwind whitespace-nowrap for card title", () => {
      assert.match(srcHTML, /text-ellipsis whitespace-nowrap/);
    });

    it("should use Tailwind classes for text color with dark mode", () => {
      assert.match(srcHTML, /text-text-primary dark:text-dark-text-primary/);
    });

    it("should preserve title attribute for full text on hover", () => {
      assert.match(srcHTML, /title="\$\{run\.task\.replace\(\/\"\/g, '&quot;'\)\}"/);
    });
  });

  describe("Card meta styling", () => {
    it("should use Tailwind text-[11px] for card meta", () => {
      assert.ok(srcHTML.includes("text-[11px] flex justify-between items-center"), "Card meta should have text-[11px] and flex layout classes");
    });

    it("should use Tailwind flex for card meta layout", () => {
      assert.match(srcHTML, /text-\[11px\] flex justify-between items-center/);
    });

    it("should use Tailwind justify-between for card meta spacing", () => {
      assert.match(srcHTML, /flex justify-between items-center/);
    });

    it("should use Tailwind items-center for card meta alignment", () => {
      assert.match(srcHTML, /justify-between items-center/);
    });

    it("should use Tailwind classes for meta color with dark mode", () => {
      assert.match(srcHTML, /text-\[11px\] flex justify-between items-center text-text-secondary dark:text-dark-text-secondary/);
    });

    it("should preserve badge and timestamp structure", () => {
      assert.match(srcHTML, /<span class="\$\{badgeInfo\.classes\}" style="\$\{badgeInfo\.style\}">\$\{run\.status\}<\/span>/);
      assert.match(srcHTML, /<span>\$\{time\}<\/span>/);
    });
  });

  describe("Status-based left border", () => {
    it("should apply green left border with dark mode for done cards", () => {
      assert.match(srcHTML, /border-l-\[3px\] border-l-accent-green dark:border-l-dark-accent-green/);
    });

    it("should apply orange left border with dark mode for failed/error cards", () => {
      assert.match(srcHTML, /border-l-\[3px\] border-l-accent-orange dark:border-l-dark-accent-orange/);
    });

    it("should apply no left border for other statuses", () => {
      assert.match(srcHTML, /: '';/);
    });

    it("should include borderLeft variable in card class string", () => {
      assert.ok(srcHTML.includes("${borderLeft}"), "Card class string should include borderLeft variable");
    });
  });

  describe("Functional preservation", () => {
    it("should preserve onclick handler for openRun", () => {
      assert.match(srcHTML, /onclick="openRun\('\$\{run\.id\}'\)"/);
    });

    it("should preserve renderBoard function", () => {
      assert.match(srcHTML, /function renderBoard\(wf, runs\)/);
    });

    it("should preserve card rendering logic", () => {
      assert.match(srcHTML, /const isDone = run\.status === 'done';/);
      assert.match(srcHTML, /const isFailed = run\.status === 'failed' \|\| run\.status === 'error';/);
    });

    it("should preserve badge rendering", () => {
      assert.match(srcHTML, /const badgeInfo = getBadgeClasses\(run\.status\)/);
    });

    it("should preserve timestamp rendering", () => {
      assert.match(srcHTML, /const time = run\.updated_at \? parseTS\(run\.updated_at\)\?\.toLocaleString\(\)/);
    });

    it("should preserve title truncation logic", () => {
      assert.match(srcHTML, /const title = run\.task\.length > 60 \? run\.task\.slice\(0, 57\) \+ '…' : run\.task;/);
    });

    it("should remove old cls variable for status classes", () => {
      assert.doesNotMatch(srcHTML, /const cls = isDone \? 'done' : isFailed \? 'failed' : '';/);
    });
  });

  describe("Build output", () => {
    it("should have dist HTML file", () => {
      assert.ok(existsSync(distFile), "dist/server/index.html should exist after build");
    });

    it("should match source HTML", () => {
      if (existsSync(distFile)) {
        const distHTML = readFileSync(distFile, "utf-8");
        assert.equal(distHTML, srcHTML, "dist HTML should match source HTML");
      }
    });
  });

  describe("Responsive design", () => {
    it("should work with existing column mobile-first layout", () => {
      assert.ok(srcHTML.includes("min-w-[240px] flex-1 rounded-lg flex flex-col"), "Column should have mobile-first flex layout classes");
    });

    it("should maintain gap between cards", () => {
      assert.match(srcHTML, /class="p-2 flex-1 flex flex-col gap-2 overflow-y-auto"/);
    });
  });
});
