/**
 * Tests for story-02: HeroSection Code Connect definition.
 * Verifies that the hero-section component files exist and are correctly structured.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const COMPONENTS = path.join(ROOT, "landing", "components");

describe("HeroSection Code Connect component (story-02)", () => {
  it("landing/components/hero-section.html exists", () => {
    assert.ok(
      existsSync(path.join(COMPONENTS, "hero-section.html")),
      "hero-section.html should exist in landing/components/"
    );
  });

  it("landing/components/hero-section.figma.ts exists", () => {
    assert.ok(
      existsSync(path.join(COMPONENTS, "hero-section.figma.ts")),
      "hero-section.figma.ts should exist in landing/components/"
    );
  });

  it("hero-section.html contains hero section markup", () => {
    const html = readFileSync(path.join(COMPONENTS, "hero-section.html"), "utf-8");
    assert.ok(html.includes('<section class="hero">'), 'should contain <section class="hero">');
    assert.ok(html.includes("hero-row"), "should contain hero-row div");
    assert.ok(html.includes("hero-sub"), "should contain hero-sub paragraph");
  });

  it("hero-section.figma.ts imports from @figma/code-connect/html", () => {
    const ts = readFileSync(path.join(COMPONENTS, "hero-section.figma.ts"), "utf-8");
    assert.ok(
      ts.includes("@figma/code-connect/html"),
      "should import from @figma/code-connect/html"
    );
  });

  it("hero-section.figma.ts calls figma.connect()", () => {
    const ts = readFileSync(path.join(COMPONENTS, "hero-section.figma.ts"), "utf-8");
    assert.ok(ts.includes("figma.connect("), "should call figma.connect()");
  });

  it("hero-section.figma.ts defines title prop as figma.string", () => {
    const ts = readFileSync(path.join(COMPONENTS, "hero-section.figma.ts"), "utf-8");
    assert.ok(
      ts.includes('title') && ts.includes('figma.string('),
      "should define title prop using figma.string()"
    );
  });

  it("hero-section.figma.ts defines subtitle prop as figma.string", () => {
    const ts = readFileSync(path.join(COMPONENTS, "hero-section.figma.ts"), "utf-8");
    assert.ok(
      ts.includes('subtitle') && ts.includes('figma.string('),
      "should define subtitle prop using figma.string()"
    );
  });
});
