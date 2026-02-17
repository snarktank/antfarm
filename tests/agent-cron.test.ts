import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../dist/db.js";
import { ensureWorkflowCrons, removeAgentCrons } from "../dist/installer/agent-cron.js";
import { listCronJobs } from "../dist/installer/gateway-api.js";
import type { WorkflowSpec } from "../dist/installer/types.js";

// Helper to create a minimal workflow spec
function createTestWorkflow(agents: Array<{ id: string; name: string }>): WorkflowSpec {
  return {
    id: "test-workflow",
    name: "Test Workflow",
    version: 1,
    description: "Test workflow for cron creation",
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      workspace: {
        baseDir: `agents/${a.id}`,
        files: {},
      },
    })),
    steps: [],
  };
}

describe("agent-cron", () => {
  beforeEach(async () => {
    // Ensure DB is initialized for tests that need it
    getDb();
    // Clean up any existing test crons
    await removeAgentCrons("test-workflow");
  });

  afterEach(async () => {
    // Clean up test crons
    await removeAgentCrons("test-workflow");
  });

  it("creates crons for all agents in a workflow", async () => {
    const workflow = createTestWorkflow([
      { id: "agent1", name: "Agent 1" },
      { id: "agent2", name: "Agent 2" },
    ]);

    await ensureWorkflowCrons(workflow);

    const cronListResult = await listCronJobs();
    assert.ok(cronListResult.ok, "Failed to list cron jobs");
    assert.ok(cronListResult.jobs, "No cron jobs returned");

    const testCrons = cronListResult.jobs.filter((j) => j.name.startsWith("antfarm/test-workflow/"));
    assert.strictEqual(testCrons.length, 2, "Should create 2 crons");
    
    const cronNames = testCrons.map((c) => c.name).sort();
    assert.deepStrictEqual(
      cronNames,
      ["antfarm/test-workflow/agent1", "antfarm/test-workflow/agent2"],
      "Cron names should match agent IDs"
    );
  });

  it("skips creating crons that already exist", async () => {
    const workflow = createTestWorkflow([
      { id: "agent1", name: "Agent 1" },
      { id: "agent2", name: "Agent 2" },
    ]);

    // First call creates crons
    await ensureWorkflowCrons(workflow);

    const firstListResult = await listCronJobs();
    assert.ok(firstListResult.ok);
    const firstCount = firstListResult.jobs!.filter((j) => j.name.startsWith("antfarm/test-workflow/")).length;

    // Second call should be idempotent
    await ensureWorkflowCrons(workflow);

    const secondListResult = await listCronJobs();
    assert.ok(secondListResult.ok);
    const secondCount = secondListResult.jobs!.filter((j) => j.name.startsWith("antfarm/test-workflow/")).length;

    assert.strictEqual(firstCount, secondCount, "Should not create duplicate crons");
    assert.strictEqual(secondCount, 2, "Should still have exactly 2 crons");
  });

  it("creates crons for new agents added to existing workflow", async () => {
    // Start with 2 agents
    const initialWorkflow = createTestWorkflow([
      { id: "agent1", name: "Agent 1" },
      { id: "agent2", name: "Agent 2" },
    ]);

    await ensureWorkflowCrons(initialWorkflow);

    const firstListResult = await listCronJobs();
    assert.ok(firstListResult.ok);
    const firstCrons = firstListResult.jobs!.filter((j) => j.name.startsWith("antfarm/test-workflow/"));
    assert.strictEqual(firstCrons.length, 2, "Should have 2 crons initially");

    // Add a third agent
    const expandedWorkflow = createTestWorkflow([
      { id: "agent1", name: "Agent 1" },
      { id: "agent2", name: "Agent 2" },
      { id: "agent3", name: "Agent 3" },
    ]);

    await ensureWorkflowCrons(expandedWorkflow);

    const secondListResult = await listCronJobs();
    assert.ok(secondListResult.ok);
    const secondCrons = secondListResult.jobs!.filter((j) => j.name.startsWith("antfarm/test-workflow/"));
    assert.strictEqual(secondCrons.length, 3, "Should now have 3 crons");

    const cronNames = secondCrons.map((c) => c.name).sort();
    assert.deepStrictEqual(
      cronNames,
      [
        "antfarm/test-workflow/agent1",
        "antfarm/test-workflow/agent2",
        "antfarm/test-workflow/agent3",
      ],
      "Should have crons for all three agents"
    );
  });

  it("removes all crons for a workflow", async () => {
    const workflow = createTestWorkflow([
      { id: "agent1", name: "Agent 1" },
      { id: "agent2", name: "Agent 2" },
    ]);

    await ensureWorkflowCrons(workflow);

    const beforeRemoval = await listCronJobs();
    assert.ok(beforeRemoval.ok);
    const beforeCount = beforeRemoval.jobs!.filter((j) => j.name.startsWith("antfarm/test-workflow/")).length;
    assert.strictEqual(beforeCount, 2, "Should have 2 crons before removal");

    await removeAgentCrons("test-workflow");

    const afterRemoval = await listCronJobs();
    assert.ok(afterRemoval.ok);
    const afterCount = afterRemoval.jobs!.filter((j) => j.name.startsWith("antfarm/test-workflow/")).length;
    assert.strictEqual(afterCount, 0, "Should have 0 crons after removal");
  });
});
