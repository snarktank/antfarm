/**
 * Regression test for multi-line output variable resolution.
 * Issue: https://github.com/snarktank/antfarm/issues/111
 *
 * The output parser in completeStep() used a per-line regex /^([A-Z_]+):\s*(.+)$/
 * that failed for multi-line values:
 *   1. Keys with value starting on the next line (e.g. "FINDINGS:\n- item") didn't match
 *      because .+ requires at least one char — downstream got [missing: findings]
 *   2. Keys with values spanning multiple lines only captured the first line
 *
 * Fix: accumulation-based parser that collects lines until the next KEY: boundary.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseOutputKeyValues } from "../dist/installer/step-ops.js";

describe("parseOutputKeyValues — multi-line output parsing", () => {

  it("parses single-line KEY: value pairs", () => {
    const output = "STATUS: done\nREPO: /Users/scout/antfarm\nVULNERABILITY_COUNT: 3";
    const result = parseOutputKeyValues(output);
    assert.equal(result["status"], "done");
    assert.equal(result["repo"], "/Users/scout/antfarm");
    assert.equal(result["vulnerability_count"], "3");
  });

  it("captures multi-line value when content starts on the same line", () => {
    const output = [
      "STATUS: done",
      "FINDINGS: first finding",
      "- SEVERITY: Medium",
      "  FILE: src/installer/step-ops.ts",
      "- SEVERITY: Low",
      "  FILE: src/db.ts",
      "VULNERABILITY_COUNT: 2",
    ].join("\n");

    const result = parseOutputKeyValues(output);
    assert.equal(result["status"], "done");
    assert.equal(result["vulnerability_count"], "2");

    // FINDINGS should contain the full multi-line value
    const findings = result["findings"];
    assert.ok(findings, "findings key should exist");
    assert.ok(findings.includes("first finding"), "should include first line of value");
    assert.ok(findings.includes("- SEVERITY: Medium"), "should include continuation lines");
    assert.ok(findings.includes("FILE: src/db.ts"), "should include all continuation lines");
  });

  it("captures multi-line value when content starts on the NEXT line (empty first line)", () => {
    const output = [
      "STATUS: done",
      "FINDINGS:",
      "- SEVERITY: Medium",
      "  FILE: src/installer/step-ops.ts",
      "- SEVERITY: Low",
      "  FILE: src/db.ts",
      "VULNERABILITY_COUNT: 1",
    ].join("\n");

    const result = parseOutputKeyValues(output);
    assert.equal(result["status"], "done");
    assert.equal(result["vulnerability_count"], "1");

    // FINDINGS should contain all the lines below it
    const findings = result["findings"];
    assert.ok(findings, "findings key should exist when value starts on next line");
    assert.ok(findings.includes("- SEVERITY: Medium"), "should capture lines after empty KEY:");
    assert.ok(findings.includes("FILE: src/db.ts"), "should capture all continuation lines");
  });

  it("handles multi-line value as the last key in output", () => {
    const output = [
      "STATUS: done",
      "CHANGES:",
      "Updated filterUsers in src/lib/search.ts",
      "Added null check before comparison",
    ].join("\n");

    const result = parseOutputKeyValues(output);
    assert.equal(result["status"], "done");
    const changes = result["changes"];
    assert.ok(changes, "changes key should exist");
    assert.ok(changes.includes("Updated filterUsers"), "should capture first continuation line");
    assert.ok(changes.includes("Added null check"), "should capture second continuation line");
  });

  it("preserves JSON multi-line values", () => {
    const output = [
      'STATUS: done',
      'DATA: [{"name": "a"},',
      '{"name": "b"}]',
      'COUNT: 2',
    ].join("\n");

    const result = parseOutputKeyValues(output);
    assert.equal(result["status"], "done");
    assert.equal(result["count"], "2");
    const data = result["data"];
    assert.ok(data, "data key should exist");
    assert.ok(data.includes('"name": "a"'), "should include JSON content");
    assert.ok(data.includes('"name": "b"'), "should include continuation of JSON");
  });

  it("skips STORIES_JSON keys", () => {
    const output = 'STATUS: done\nSTORIES_JSON: [{"id": "s1"}]\nCOUNT: 1';
    const result = parseOutputKeyValues(output);
    assert.equal(result["status"], "done");
    assert.equal(result["count"], "1");
    assert.equal(result["stories_json"], undefined, "STORIES_JSON should be skipped");
  });

  it("handles empty output", () => {
    const result = parseOutputKeyValues("");
    assert.deepEqual(result, {});
  });

  it("trims whitespace from values", () => {
    const output = "STATUS:   done   \nNOTE:   some note   ";
    const result = parseOutputKeyValues(output);
    assert.equal(result["status"], "done");
    assert.equal(result["note"], "some note");
  });
});
