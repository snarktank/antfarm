/**
 * Regression test: CLI fallback must include payload.kind
 *
 * Bug: When the HTTP endpoint returns 404, the CLI fallback is used to create
 * cron jobs. However, the CLI fallback was not passing the `kind` field from
 * the payload (e.g., `kind: "agentTurn"`). This caused a mismatch between the
 * cron payload configuration and actual agent job creation - the gateway didn't
 * know to trigger an agent work session because the `kind` was missing.
 *
 * Fix: Added `--kind` flag to CLI fallback in gateway-api.ts createAgentCronJob.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("cron CLI fallback includes payload.kind (regression)", () => {
  it("source code includes --kind flag in CLI fallback", () => {
    // Read the source file to verify the fix is present
    const gatewayApiPath = path.resolve(
      import.meta.dirname,
      "../dist/installer/gateway-api.js"
    );
    
    const content = fs.readFileSync(gatewayApiPath, "utf-8");
    
    // Verify the CLI fallback section includes --kind
    assert.ok(
      content.includes('args.push("--kind", job.payload.kind)'),
      "gateway-api.js should include --kind flag in CLI fallback"
    );
  });

  it("source code checks for payload.kind before adding --kind flag", () => {
    const gatewayApiPath = path.resolve(
      import.meta.dirname,
      "../dist/installer/gateway-api.js"
    );
    
    const content = fs.readFileSync(gatewayApiPath, "utf-8");
    
    // Verify the conditional check for kind is present
    assert.ok(
      content.includes("if (job.payload?.kind)"),
      "gateway-api.js should check for payload.kind before using it"
    );
  });

  it("CLI fallback args order: kind comes before message", () => {
    const gatewayApiPath = path.resolve(
      import.meta.dirname,
      "../dist/installer/gateway-api.js"
    );
    
    const content = fs.readFileSync(gatewayApiPath, "utf-8");
    
    // Find the relative positions of --kind and --message in the file
    // They should appear in the CLI fallback section
    const kindPos = content.indexOf('"--kind"');
    const messagePos = content.indexOf('"--message"');
    
    assert.ok(kindPos > 0, "Should find --kind in gateway-api.js");
    assert.ok(messagePos > 0, "Should find --message in gateway-api.js");
    
    // In the createAgentCronJob function, --kind should be added before --message
    assert.ok(
      kindPos < messagePos,
      `--kind (${kindPos}) should appear before --message (${messagePos}) in the CLI fallback`
    );
  });
});
