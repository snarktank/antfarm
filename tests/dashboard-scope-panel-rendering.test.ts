import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("dashboard scope panel template", () => {
  it("renders scope panel metadata and deterministic empty state", () => {
    const html = fs.readFileSync(path.join(process.cwd(), "src/server/index.html"), "utf8");

    assert.match(html, /function renderScopePanel\(run\)/);
    assert.match(html, /Execution Scope/);
    assert.match(html, /Frozen at:/);
    assert.match(html, /Violations:/);
    assert.match(html, /No frozen scope is available for this run\./);
    assert.match(html, /\$\{renderScopePanel\(run\)\}/);
  });

  it("maps scope status to draft\/frozen-style badges", () => {
    const html = fs.readFileSync(path.join(process.cwd(), "src/server/index.html"), "utf8");

    assert.match(html, /if \(status === 'frozen'\) return 'badge-completed';/);
    assert.match(html, /if \(status === 'draft'\) return 'badge-pending';/);
  });
});
