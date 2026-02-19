import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const srcHtml = resolve(projectRoot, "src/server/index.html");
const distHtml = resolve(projectRoot, "dist/server/index.html");

describe("Board Layout Migration - US-003", () => {
  it("source HTML exists", () => {
    assert.ok(existsSync(srcHtml), "src/server/index.html should exist");
  });

  const html = readFileSync(srcHtml, "utf-8");

  describe("Board Structure", () => {
    it("board has Tailwind flex container classes", () => {
      assert.ok(
        html.includes('class="flex flex-col md:flex-row gap-4 p-6 overflow-x-auto"'),
        "Board should have responsive flex classes"
      );
    });

    it("board has min-height inline style", () => {
      assert.ok(
        html.includes('style="min-height:calc(100vh - 65px)"'),
        "Board should have min-height inline style"
      );
    });

    it("board uses md: breakpoint for responsive layout", () => {
      assert.ok(
        html.includes("md:flex-row"),
        "Board should use md: prefix for desktop layout"
      );
    });

    it("board has gap utility for spacing", () => {
      assert.ok(
        html.includes("gap-4"),
        "Board should use Tailwind gap utility"
      );
    });

    it("board has padding utility", () => {
      assert.ok(
        html.includes("p-6"),
        "Board should use Tailwind padding utility"
      );
    });

    it("board has overflow-x-auto for horizontal scroll", () => {
      assert.ok(
        html.includes("overflow-x-auto"),
        "Board should have horizontal scroll enabled"
      );
    });
  });

  describe("Column Structure", () => {
    it("column has min-width utility", () => {
      assert.ok(
        html.includes("min-w-[240px]"),
        "Column should have min-width utility"
      );
    });

    it("column has flex-1 for growth", () => {
      assert.ok(
        html.includes("flex-1"),
        "Column should use flex-1 for equal distribution"
      );
    });

    it("column has rounded corners", () => {
      assert.ok(
        html.includes("rounded-lg"),
        "Column should have rounded corners"
      );
    });

    it("column has flex flex-col layout", () => {
      assert.ok(
        html.includes("flex flex-col"),
        "Column should be a vertical flex container"
      );
    });

    it("column uses Tailwind classes for background with dark mode", () => {
      assert.ok(
        html.includes("bg-bg-surface dark:bg-dark-bg-surface"),
        "Column should use Tailwind classes for background"
      );
    });

    it("column uses Tailwind classes for box-shadow with dark mode", () => {
      assert.ok(
        html.includes("shadow-light dark:shadow-dark-light"),
        "Column should use Tailwind classes for shadow"
      );
    });
  });

  describe("Column Header Structure", () => {
    it("column header has padding utilities", () => {
      assert.ok(
        html.includes("px-4 py-3"),
        "Column header should have horizontal and vertical padding"
      );
    });

    it("column header has border-b", () => {
      assert.ok(
        html.includes("border-b"),
        "Column header should have bottom border"
      );
    });

    it("column header has text size utility", () => {
      assert.ok(
        html.includes("text-xs"),
        "Column header should use text-xs utility"
      );
    });

    it("column header has font-semibold", () => {
      assert.ok(
        html.includes("font-semibold"),
        "Column header should be semi-bold"
      );
    });

    it("column header has uppercase", () => {
      assert.ok(
        html.includes("uppercase"),
        "Column header should be uppercase"
      );
    });

    it("column header has tracking-wider", () => {
      assert.ok(
        html.includes("tracking-wider"),
        "Column header should have letter spacing"
      );
    });

    it("column header has rounded top corners", () => {
      assert.ok(
        html.includes("rounded-t-lg"),
        "Column header should have rounded top corners"
      );
    });

    it("column header uses Tailwind classes for color with dark mode", () => {
      assert.ok(
        html.includes("text-accent-green dark:text-dark-accent-green"),
        "Column header should use Tailwind classes for text color"
      );
    });

    it("column header uses Tailwind classes for background with dark mode", () => {
      assert.ok(
        html.includes("bg-bg-column-header dark:bg-dark-bg-column-header"),
        "Column header should use Tailwind classes for background"
      );
    });

    it("column header uses Tailwind classes for border with dark mode", () => {
      assert.ok(
        html.includes("border-border-light dark:border-dark-border-light"),
        "Column header should use Tailwind classes for border"
      );
    });
  });

  describe("Column Count Badge", () => {
    it("count badge has inline-block display", () => {
      assert.ok(
        html.includes("inline-block"),
        "Count badge should be inline-block"
      );
    });

    it("count badge has text-white", () => {
      assert.ok(
        html.includes("text-white"),
        "Count badge should have white text"
      );
    });

    it("count badge has rounded-full", () => {
      assert.ok(
        html.includes("rounded-full"),
        "Count badge should be fully rounded"
      );
    });

    it("count badge has padding utilities", () => {
      assert.ok(
        html.includes("px-2 py-0.5"),
        "Count badge should have horizontal and vertical padding"
      );
    });

    it("count badge has custom text size", () => {
      assert.ok(
        html.includes("text-[11px]"),
        "Count badge should use custom text size"
      );
    });

    it("count badge has margin-left utility", () => {
      assert.ok(
        html.includes("ml-2"),
        "Count badge should have left margin"
      );
    });

    it("count badge uses Tailwind classes for background with dark mode", () => {
      assert.ok(
        html.includes("bg-accent-green dark:bg-dark-accent-green"),
        "Count badge should use Tailwind classes for background"
      );
    });
  });

  describe("Cards Container Structure", () => {
    it("cards container has padding utility", () => {
      assert.ok(
        html.includes("p-2"),
        "Cards container should have padding"
      );
    });

    it("cards container has flex-1 for growth", () => {
      assert.ok(
        html.includes("flex-1"),
        "Cards container should use flex-1 to fill space"
      );
    });

    it("cards container has flex flex-col layout", () => {
      assert.ok(
        html.includes("flex flex-col"),
        "Cards container should be a vertical flex container"
      );
    });

    it("cards container has gap utility", () => {
      assert.ok(
        html.includes("gap-2"),
        "Cards container should have gap between items"
      );
    });

    it("cards container has overflow-y-auto", () => {
      assert.ok(
        html.includes("overflow-y-auto"),
        "Cards container should have vertical scroll"
      );
    });
  });

  describe("CSS Removal", () => {
    it("old .board CSS is removed", () => {
      assert.ok(
        !html.includes(".board{display:flex"),
        "Old .board CSS should be removed"
      );
    });

    it("old .column CSS is removed", () => {
      assert.ok(
        !html.includes(".column{min-width:240px"),
        "Old .column CSS should be removed"
      );
    });

    it("old .column-header CSS is removed", () => {
      assert.ok(
        !html.includes(".column-header{padding:12px"),
        "Old .column-header CSS should be removed"
      );
    });

    it("old .column-header .count CSS is removed", () => {
      assert.ok(
        !html.includes(".column-header .count{"),
        "Old .column-header .count CSS should be removed"
      );
    });

    it("old .cards CSS is removed", () => {
      assert.ok(
        !html.includes(".cards{padding:8px"),
        "Old .cards CSS should be removed"
      );
    });

    it("old responsive media query is removed", () => {
      assert.ok(
        !html.includes("@media(max-width:768px){.board{flex-direction:column}"),
        "Old responsive media query should be removed"
      );
    });

    it("board migration comment exists", () => {
      assert.ok(
        html.includes("/* Board layout migrated to Tailwind classes */"),
        "Migration comment should be present"
      );
    });
  });

  describe("Functional Preservation", () => {
    it("board has id='board'", () => {
      assert.ok(
        html.includes('id="board"'),
        "Board should have id for JavaScript"
      );
    });

    it("empty state message is preserved with Tailwind classes", () => {
      assert.ok(
        html.includes('m-auto text-text-secondary dark:text-dark-text-secondary') &&
        html.includes('Select a workflow'),
        "Empty state message should use Tailwind classes"
      );
    });

    it("renderBoard function exists", () => {
      assert.ok(
        html.includes("function renderBoard(wf, runs)"),
        "renderBoard function should exist"
      );
    });

    it("renderBoard creates columns", () => {
      assert.ok(
        html.includes("board.innerHTML = wf.steps.map(step =>"),
        "renderBoard should create columns from steps"
      );
    });

    it("card rendering is preserved", () => {
      assert.ok(
        html.includes('<div class="rounded-md border p-3 cursor-pointer') &&
        html.includes('onclick="openRun'),
        "Card rendering logic should be preserved with Tailwind classes"
      );
    });
  });

  describe("Build Output", () => {
    it("dist HTML exists after build", () => {
      assert.ok(existsSync(distHtml), "dist/server/index.html should exist");
    });

    it("dist HTML matches source structure", () => {
      const dist = readFileSync(distHtml, "utf-8");
      assert.ok(
        dist.includes('class="flex flex-col md:flex-row gap-4 p-6 overflow-x-auto"'),
        "Dist HTML should have board Tailwind classes"
      );
      assert.ok(
        dist.includes("min-w-[240px]"),
        "Dist HTML should have column Tailwind classes"
      );
    });
  });

  describe("Responsive Design", () => {
    it("mobile layout uses flex-col (default)", () => {
      assert.ok(
        html.includes("flex-col"),
        "Board should default to column layout on mobile"
      );
    });

    it("desktop layout uses md:flex-row", () => {
      assert.ok(
        html.includes("md:flex-row"),
        "Board should switch to row layout on desktop"
      );
    });

    it("columns maintain min-width on all screens", () => {
      assert.ok(
        html.includes("min-w-[240px]"),
        "Columns should maintain minimum width"
      );
    });
  });
});
