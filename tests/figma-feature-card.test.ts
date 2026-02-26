/**
 * Tests for story-03: FeatureCard Code Connect definition.
 * Verifies that the feature-card component files exist and are correctly structured.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const COMPONENTS = path.join(ROOT, "landing", "components");

describe("FeatureCard Code Connect component (story-03)", () => {
  it("landing/components/feature-card.html exists", () => {
    assert.ok(
      existsSync(path.join(COMPONENTS, "feature-card.html")),
      "feature-card.html should exist in landing/components/"
    );
  });

  it("landing/components/feature-card.figma.ts exists", () => {
    assert.ok(
      existsSync(path.join(COMPONENTS, "feature-card.figma.ts")),
      "feature-card.figma.ts should exist in landing/components/"
    );
  });

  it("feature-card.html contains wf-card markup", () => {
    const html = readFileSync(path.join(COMPONENTS, "feature-card.html"), "utf-8");
    assert.ok(html.includes('class="wf-card"'), 'should contain wf-card class');
    assert.ok(html.includes("wf-header"), "should contain wf-header");
    assert.ok(html.includes("wf-badge"), "should contain wf-badge");
    assert.ok(html.includes("wf-pipeline"), "should contain wf-pipeline");
  });

  it("feature-card.figma.ts imports from @figma/code-connect/html", () => {
    const ts = readFileSync(path.join(COMPONENTS, "feature-card.figma.ts"), "utf-8");
    assert.ok(
      ts.includes("@figma/code-connect/html"),
      "should import from @figma/code-connect/html"
    );
  });

  it("feature-card.figma.ts calls figma.connect()", () => {
    const ts = readFileSync(path.join(COMPONENTS, "feature-card.figma.ts"), "utf-8");
    assert.ok(ts.includes("figma.connect("), "should call figma.connect()");
  });

  it("feature-card.figma.ts defines title prop", () => {
    const ts = readFileSync(path.join(COMPONENTS, "feature-card.figma.ts"), "utf-8");
    assert.ok(ts.includes("title") && ts.includes("figma.string("), "should define title prop");
  });

  it("feature-card.figma.ts defines badge prop", () => {
    const ts = readFileSync(path.join(COMPONENTS, "feature-card.figma.ts"), "utf-8");
    assert.ok(ts.includes("badge"), "should define badge prop");
  });

  it("feature-card.figma.ts defines description prop", () => {
    const ts = readFileSync(path.join(COMPONENTS, "feature-card.figma.ts"), "utf-8");
    assert.ok(ts.includes("description"), "should define description prop");
  });

  it("feature-card.figma.ts defines pipeline prop", () => {
    const ts = readFileSync(path.join(COMPONENTS, "feature-card.figma.ts"), "utf-8");
    assert.ok(ts.includes("pipeline"), "should define pipeline prop");
  });
});
