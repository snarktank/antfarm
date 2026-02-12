/**
 * Regression test: agent cron jobs must include delivery config.
 * 
 * Bug: Commit 2f60f7b removed `delivery: { mode: "none" }` from cron creation,
 * causing OpenClaw to default to "announce" mode without required channel/to fields.
 * This broke all polling agent crons on fresh workflow installations.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const SRC = path.resolve(import.meta.dirname, "..", "src", "installer");

describe("agent cron delivery defaults", () => {
  it("should include delivery: { mode: 'none' } by default for polling agents", async () => {
    const agentCronSource = await fs.readFile(path.join(SRC, "agent-cron.ts"), "utf-8");

    assert.ok(
      agentCronSource.includes('delivery'),
      "agent-cron.ts must pass delivery config to createAgentCronJob"
    );

    assert.ok(
      agentCronSource.includes('{ mode: "none" }'),
      'agent-cron.ts must default delivery to { mode: "none" } for polling agents'
    );

    const gatewayApiSource = await fs.readFile(path.join(SRC, "gateway-api.ts"), "utf-8");

    assert.ok(
      gatewayApiSource.includes("delivery?:"),
      "gateway-api.ts createAgentCronJob type must include optional delivery field"
    );
  });

  it("should allow per-agent delivery override from workflow config", async () => {
    const agentCronSource = await fs.readFile(path.join(SRC, "agent-cron.ts"), "utf-8");

    assert.ok(
      agentCronSource.includes("agent.delivery"),
      "agent-cron.ts must read delivery from agent config to allow per-agent overrides"
    );

    const typesSource = await fs.readFile(path.join(SRC, "types.ts"), "utf-8");

    assert.ok(
      typesSource.includes("delivery?:"),
      "WorkflowAgent type must include optional delivery field"
    );
  });
});
