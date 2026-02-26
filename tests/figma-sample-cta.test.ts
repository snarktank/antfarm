/**
 * Tests for story-05: SampleCTA landing page component (HTML + CSS).
 * Verifies the CTA section, styles, and index.html integration.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const LANDING = path.join(ROOT, "landing");
const COMPONENTS = path.join(LANDING, "components");

describe("SampleCTA landing page component (story-05)", () => {
  // ── Component file ────────────────────────────────────────────────

  it("landing/components/sample-cta.html exists", () => {
    assert.ok(
      existsSync(path.join(COMPONENTS, "sample-cta.html")),
      "sample-cta.html should exist in landing/components/"
    );
  });

  it("sample-cta.html has id='sample-cta'", () => {
    const html = readFileSync(path.join(COMPONENTS, "sample-cta.html"), "utf-8");
    assert.ok(html.includes('id="sample-cta"'), "should have id='sample-cta'");
  });

  it("sample-cta.html contains a headline element", () => {
    const html = readFileSync(path.join(COMPONENTS, "sample-cta.html"), "utf-8");
    assert.ok(html.includes("cta-headline"), "should have .cta-headline element");
  });

  it("sample-cta.html contains a subtext element", () => {
    const html = readFileSync(path.join(COMPONENTS, "sample-cta.html"), "utf-8");
    assert.ok(html.includes("cta-sub"), "should have .cta-sub element");
  });

  it("sample-cta.html contains a primary button/link to GitHub", () => {
    const html = readFileSync(path.join(COMPONENTS, "sample-cta.html"), "utf-8");
    assert.ok(html.includes("cta-btn"), "should have .cta-btn element");
    assert.ok(html.includes("github.com"), "cta-btn should link to GitHub");
  });

  // ── index.html integration ────────────────────────────────────────

  it("landing/index.html includes #sample-cta section", () => {
    const html = readFileSync(path.join(LANDING, "index.html"), "utf-8");
    assert.ok(html.includes('id="sample-cta"'), "index.html should contain #sample-cta section");
  });

  it("landing/index.html has #sample-cta before </main> or before footer", () => {
    const html = readFileSync(path.join(LANDING, "index.html"), "utf-8");
    const ctaIdx = html.indexOf('id="sample-cta"');
    const footerIdx = html.indexOf('<footer');
    assert.ok(ctaIdx !== -1, "#sample-cta should exist in index.html");
    assert.ok(footerIdx !== -1, "<footer should exist in index.html");
    assert.ok(ctaIdx < footerIdx, "#sample-cta should appear before <footer");
  });

  // ── CSS styles ────────────────────────────────────────────────────

  it("landing/style.css contains .cta-section styles", () => {
    const css = readFileSync(path.join(LANDING, "style.css"), "utf-8");
    assert.ok(css.includes(".cta-section"), "style.css should have .cta-section");
  });

  it("landing/style.css contains .cta-headline styles", () => {
    const css = readFileSync(path.join(LANDING, "style.css"), "utf-8");
    assert.ok(css.includes(".cta-headline"), "style.css should have .cta-headline");
  });

  it("landing/style.css contains .cta-sub styles", () => {
    const css = readFileSync(path.join(LANDING, "style.css"), "utf-8");
    assert.ok(css.includes(".cta-sub"), "style.css should have .cta-sub");
  });

  it("landing/style.css contains .cta-btn styles", () => {
    const css = readFileSync(path.join(LANDING, "style.css"), "utf-8");
    assert.ok(css.includes(".cta-btn"), "style.css should have .cta-btn");
  });

  it("landing/style.css uses design tokens in .cta-section styles", () => {
    const css = readFileSync(path.join(LANDING, "style.css"), "utf-8");
    assert.ok(css.includes("var(--"), "CTA styles should use CSS custom properties");
  });

  it("landing/style.css has responsive @media (max-width: 600px) for CTA", () => {
    const css = readFileSync(path.join(LANDING, "style.css"), "utf-8");
    // Check both the media query and that .cta-section appears within it
    const mediaIdx = css.indexOf("@media (max-width: 600px)");
    assert.ok(mediaIdx !== -1, "style.css should have @media (max-width: 600px) for CTA");
    const afterMedia = css.slice(mediaIdx);
    assert.ok(afterMedia.includes(".cta-"), "responsive styles should include CTA class overrides");
  });
});
