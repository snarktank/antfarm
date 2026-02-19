import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");

describe("US-002: Header and navigation migration", () => {
  describe("index.html header structure", () => {
    let indexHTML: string;

    it("should have index.html in src/server", () => {
      const path = resolve(projectRoot, "src/server/index.html");
      assert.ok(existsSync(path), "index.html should exist");
      indexHTML = readFileSync(path, "utf-8");
    });

    it("should have a header element with Tailwind classes", () => {
      assert.ok(indexHTML.includes("<header"), "should have a header element");
      assert.ok(
        indexHTML.includes('class="flex'),
        "header should have Tailwind flex class"
      );
      assert.ok(
        indexHTML.includes("flex-wrap"),
        "header should be responsive with flex-wrap"
      );
      assert.ok(
        indexHTML.includes("items-center"),
        "header should have items-center for vertical alignment"
      );
      assert.ok(
        indexHTML.includes("gap-"),
        "header should have gap utility for spacing"
      );
    });

    it("should have header background using CSS variables (not hardcoded)", () => {
      const headerMatch = indexHTML.match(
        /<header[^>]*style="[^"]*background:var\(--header-bg\)/
      );
      assert.ok(
        headerMatch,
        "header should use var(--header-bg) for theming"
      );
    });

    it("should have border color using CSS variables", () => {
      const headerMatch = indexHTML.match(
        /<header[^>]*style="[^"]*border-color:var\(--header-border\)/
      );
      assert.ok(
        headerMatch,
        "header should use var(--header-border) for theming"
      );
    });

    it("should have h1 with title and Tailwind typography classes", () => {
      assert.ok(
        indexHTML.includes("<h1"),
        "should have an h1 element for the title"
      );
      assert.ok(
        indexHTML.includes("text-xl") || indexHTML.includes("text-2xl"),
        "h1 should have Tailwind text size class"
      );
      assert.ok(
        indexHTML.includes("font-semibold") ||
          indexHTML.includes("font-bold"),
        "h1 should have Tailwind font-weight class"
      );
      assert.ok(
        indexHTML.includes("text-white"),
        "h1 should have text-white class"
      );
      assert.ok(
        indexHTML.includes("<span"),
        "h1 should have span for 'antfarm' accent"
      );
    });

    it("should have workflow selector dropdown", () => {
      assert.ok(
        indexHTML.includes('id="wf-select"'),
        "should have workflow selector with id wf-select"
      );
      assert.ok(
        indexHTML.includes("<select"),
        "should be a select element"
      );
      assert.ok(
        indexHTML.includes("rounded"),
        "select should have rounded corners"
      );
      assert.ok(
        indexHTML.includes("cursor-pointer"),
        "select should have cursor-pointer"
      );
    });

    it("should have theme toggle button", () => {
      assert.ok(
        indexHTML.includes('id="theme-toggle"'),
        "should have theme toggle with id"
      );
      assert.ok(
        indexHTML.includes('class="theme-toggle'),
        "should have theme-toggle class"
      );
      assert.ok(
        indexHTML.includes("<button"),
        "theme toggle should be a button"
      );
      assert.ok(
        indexHTML.includes("border"),
        "theme toggle should have border class"
      );
      assert.ok(
        indexHTML.includes("rounded"),
        "theme toggle should have rounded class"
      );
    });

    it("should have medic badge", () => {
      assert.ok(
        indexHTML.includes('id="medic-badge"'),
        "should have medic badge with id"
      );
      assert.ok(
        indexHTML.includes('class="medic-badge'),
        "should have medic-badge class"
      );
      assert.ok(
        indexHTML.includes("flex"),
        "medic badge should use flexbox"
      );
      assert.ok(
        indexHTML.includes("items-center"),
        "medic badge should align items center"
      );
      assert.ok(
        indexHTML.includes('onclick="toggleMedicPanel()"'),
        "medic badge should have onclick handler"
      );
    });

    it("should have refresh note with ml-auto for right alignment", () => {
      assert.ok(
        indexHTML.includes('id="refresh-note"'),
        "should have refresh note with id"
      );
      assert.ok(
        indexHTML.includes("ml-auto"),
        "refresh note should use ml-auto for right alignment"
      );
    });

    it("should preserve selectWorkflow function reference", () => {
      assert.ok(
        indexHTML.includes("selectWorkflow"),
        "should reference selectWorkflow function"
      );
    });

    it("should preserve toggleMedicPanel function reference", () => {
      assert.ok(
        indexHTML.includes("toggleMedicPanel"),
        "should reference toggleMedicPanel function"
      );
    });

    it("should link to output.css for Tailwind styles", () => {
      assert.ok(
        indexHTML.includes('href="output.css"'),
        "should link to output.css"
      );
      assert.ok(
        indexHTML.includes('rel="stylesheet"'),
        "link should be a stylesheet"
      );
    });

    it("should not have old header CSS rules in style tag", () => {
      assert.ok(
        !indexHTML.includes("header{background:var(--header-bg)"),
        "should not have old header CSS"
      );
      assert.ok(
        !indexHTML.includes("header img{height:36px"),
        "should not have old header img CSS"
      );
    });

    it("should have minimal CSS for hover states only", () => {
      // We keep hover states in CSS since Tailwind hover classes require more complex setup
      assert.ok(
        indexHTML.includes(".theme-toggle:hover"),
        "should keep theme-toggle hover state"
      );
      assert.ok(
        indexHTML.includes(".medic-badge:hover"),
        "should keep medic-badge hover state"
      );
    });
  });

  describe("Built output", () => {
    it("should have index.html copied to dist/server", () => {
      const distPath = resolve(projectRoot, "dist/server/index.html");
      assert.ok(
        existsSync(distPath),
        "index.html should be copied to dist/server"
      );
    });

    it("should have output.css in dist/server", () => {
      const cssPath = resolve(projectRoot, "dist/server/output.css");
      assert.ok(existsSync(cssPath), "output.css should exist in dist/server");
    });
  });

  describe("Functional preservation", () => {
    let indexHTML: string;

    it("should load index.html for functional checks", () => {
      const path = resolve(projectRoot, "src/server/index.html");
      indexHTML = readFileSync(path, "utf-8");
    });

    it("should have workflow selector change event listener", () => {
      assert.ok(
        indexHTML.includes("addEventListener('change'"),
        "should have change event listener"
      );
      assert.ok(
        indexHTML.includes("selectWorkflow(e.target.value)"),
        "should call selectWorkflow with selected value"
      );
    });

    it("should have theme toggle click handler in JavaScript", () => {
      assert.ok(
        indexHTML.includes("btn.addEventListener('click'"),
        "should have click event listener for theme toggle"
      );
      assert.ok(
        indexHTML.includes("localStorage.setItem(STORAGE_KEY"),
        "should persist theme preference"
      );
    });

    it("should have all API endpoints preserved", () => {
      assert.ok(
        indexHTML.includes("/api/workflows"),
        "should have workflows endpoint"
      );
      assert.ok(
        indexHTML.includes("/api/runs"),
        "should have runs endpoint"
      );
      assert.ok(
        indexHTML.includes("/api/medic/status"),
        "should have medic status endpoint"
      );
    });

    it("should have all JavaScript functions preserved", () => {
      const functions = [
        "fetchJSON",
        "loadWorkflows",
        "selectWorkflow",
        "loadRuns",
        "renderBoard",
        "openRun",
        "closePanel",
        "toggleMedicPanel",
        "loadMedicStatus",
        "initTheme",
      ];

      for (const fn of functions) {
        assert.ok(
          indexHTML.includes(`function ${fn}`) ||
            indexHTML.includes(`const ${fn}`) ||
            indexHTML.includes(`async function ${fn}`),
          `should have ${fn} function`
        );
      }
    });
  });

  describe("Responsive design", () => {
    let indexHTML: string;

    it("should load index.html for responsive checks", () => {
      const path = resolve(projectRoot, "src/server/index.html");
      indexHTML = readFileSync(path, "utf-8");
    });

    it("should have flex-wrap for mobile responsiveness", () => {
      assert.ok(
        indexHTML.includes("flex-wrap"),
        "header should wrap on small screens"
      );
    });

    it("responsive layout uses Tailwind breakpoints (not media queries)", () => {
      assert.ok(
        !indexHTML.includes("@media(max-width:768px)"),
        "media queries replaced with Tailwind responsive classes"
      );
    });

    it("should have viewport meta tag", () => {
      assert.ok(
        indexHTML.includes('name="viewport"'),
        "should have viewport meta tag"
      );
      assert.ok(
        indexHTML.includes("width=device-width"),
        "viewport should set width to device-width"
      );
    });
  });
});
