/**
 * Tests for story-04: InstallBlock Code Connect definition.
 * Verifies that the install-block component files exist and are correctly structured.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const COMPONENTS = path.join(ROOT, "landing", "components");

describe("InstallBlock Code Connect component (story-04)", () => {
  it("landing/components/install-block.html exists", () => {
    assert.ok(
      existsSync(path.join(COMPONENTS, "install-block.html")),
      "install-block.html should exist in landing/components/"
    );
  });

  it("landing/components/install-block.figma.ts exists", () => {
    assert.ok(
      existsSync(path.join(COMPONENTS, "install-block.figma.ts")),
      "install-block.figma.ts should exist in landing/components/"
    );
  });

  it("install-block.html contains install-block markup", () => {
    const html = readFileSync(path.join(COMPONENTS, "install-block.html"), "utf-8");
    assert.ok(html.includes('class="install-block"'), 'should contain install-block class');
    assert.ok(html.includes("install-row"), "should contain install-row");
    assert.ok(html.includes("install-cmd"), "should contain install-cmd");
    assert.ok(html.includes("copy-btn"), "should contain copy-btn button");
    assert.ok(html.includes("version-badge"), "should contain version-badge");
  });

  it("install-block.figma.ts imports from @figma/code-connect/html", () => {
    const ts = readFileSync(path.join(COMPONENTS, "install-block.figma.ts"), "utf-8");
    assert.ok(
      ts.includes("@figma/code-connect/html"),
      "should import from @figma/code-connect/html"
    );
  });

  it("install-block.figma.ts calls figma.connect()", () => {
    const ts = readFileSync(path.join(COMPONENTS, "install-block.figma.ts"), "utf-8");
    assert.ok(ts.includes("figma.connect("), "should call figma.connect()");
  });

  it("install-block.figma.ts defines command prop as figma.string", () => {
    const ts = readFileSync(path.join(COMPONENTS, "install-block.figma.ts"), "utf-8");
    assert.ok(
      ts.includes("command") && ts.includes("figma.string("),
      "should define command prop using figma.string()"
    );
  });

  it("install-block.figma.ts defines version prop as figma.string", () => {
    const ts = readFileSync(path.join(COMPONENTS, "install-block.figma.ts"), "utf-8");
    assert.ok(ts.includes("version"), "should define version prop");
  });
});
