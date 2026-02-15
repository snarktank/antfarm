import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

describe("parallel-agents-cron-setup.md", () => {
  const docPath = resolve(import.meta.dirname, "../../docs/parallel-agents-cron-setup.md");

  it("documentation file exists", () => {
    assert.ok(existsSync(docPath), "docs/parallel-agents-cron-setup.md should exist");
  });

  it("documents developer-2 cron with anchorMs 150000", () => {
    const content = readFileSync(docPath, "utf-8");
    assert.ok(content.includes("feature-dev-developer-2"), "should reference developer-2");
    assert.ok(content.includes("150000"), "should include anchorMs 150000");
  });

  it("documents developer-3 cron with anchorMs 210000", () => {
    const content = readFileSync(docPath, "utf-8");
    assert.ok(content.includes("feature-dev-developer-3"), "should reference developer-3");
    assert.ok(content.includes("210000"), "should include anchorMs 210000");
  });

  it("references the existing cron job ID", () => {
    const content = readFileSync(docPath, "utf-8");
    assert.ok(content.includes("44fd72d6"), "should reference existing cron job ID");
  });

  it("includes everyMs 300000 matching existing schedule", () => {
    const content = readFileSync(docPath, "utf-8");
    assert.ok(content.includes("300000"), "should include 5-minute polling interval");
  });
});
