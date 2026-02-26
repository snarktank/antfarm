/**
 * Tests for story-06: SampleCTA Code Connect definition.
 * Verifies that sample-cta.figma.ts exists and is correctly structured.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const COMPONENTS = path.join(ROOT, "landing", "components");

describe("SampleCTA Code Connect definition (story-06)", () => {
  it("landing/components/sample-cta.figma.ts exists", () => {
    assert.ok(
      existsSync(path.join(COMPONENTS, "sample-cta.figma.ts")),
      "sample-cta.figma.ts should exist in landing/components/"
    );
  });

  it("sample-cta.figma.ts imports from @figma/code-connect/html", () => {
    const ts = readFileSync(path.join(COMPONENTS, "sample-cta.figma.ts"), "utf-8");
    assert.ok(
      ts.includes("@figma/code-connect/html"),
      "should import from @figma/code-connect/html"
    );
  });

  it("sample-cta.figma.ts calls figma.connect()", () => {
    const ts = readFileSync(path.join(COMPONENTS, "sample-cta.figma.ts"), "utf-8");
    assert.ok(ts.includes("figma.connect("), "should call figma.connect()");
  });

  it("sample-cta.figma.ts defines headline prop", () => {
    const ts = readFileSync(path.join(COMPONENTS, "sample-cta.figma.ts"), "utf-8");
    assert.ok(ts.includes("headline") && ts.includes("figma.string("), "should define headline prop using figma.string()");
  });

  it("sample-cta.figma.ts defines subtext prop", () => {
    const ts = readFileSync(path.join(COMPONENTS, "sample-cta.figma.ts"), "utf-8");
    assert.ok(ts.includes("subtext"), "should define subtext prop");
  });

  it("sample-cta.figma.ts defines ctaLabel prop", () => {
    const ts = readFileSync(path.join(COMPONENTS, "sample-cta.figma.ts"), "utf-8");
    assert.ok(ts.includes("ctaLabel"), "should define ctaLabel prop");
  });

  it("sample-cta.figma.ts defines ctaHref prop", () => {
    const ts = readFileSync(path.join(COMPONENTS, "sample-cta.figma.ts"), "utf-8");
    assert.ok(ts.includes("ctaHref"), "should define ctaHref prop");
  });

  it("sample-cta.figma.ts example renders cta-section with id=sample-cta", () => {
    const ts = readFileSync(path.join(COMPONENTS, "sample-cta.figma.ts"), "utf-8");
    assert.ok(ts.includes('id="sample-cta"'), 'example should include id="sample-cta"');
    assert.ok(ts.includes("cta-section"), "example should include cta-section class");
  });
});
