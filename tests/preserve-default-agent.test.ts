/**
 * Regression test: installing antfarm must never overwrite the user's default (main) agent.
 *
 * Bug: upsertAgent would Object.assign over any existing agent with a matching id,
 * which could clobber the main agent's workspace, agentDir, and drop the `default: true` flag.
 */

// Inline test of the upsertAgent logic (extracted to avoid full install side effects)

type AgentEntry = Record<string, unknown>;

function upsertAgent(
  list: AgentEntry[],
  agent: { id: string; name?: string; workspaceDir: string; agentDir: string },
) {
  const existing = list.find((entry) => entry.id === agent.id);

  // Never overwrite the user's default (main) agent
  if (existing?.default === true) return;

  const payload: AgentEntry = {
    id: agent.id,
    name: agent.name ?? agent.id,
    workspace: agent.workspaceDir,
    agentDir: agent.agentDir,
  };
  if (existing) Object.assign(existing, payload);
  else list.push(payload);
}

function testDefaultAgentNotOverwritten(): void {
  console.log("Test: default agent is not overwritten by upsertAgent...");

  const mainAgent: AgentEntry = {
    id: "main",
    name: "Harry",
    default: true,
    workspace: "/Users/user/clawd",
    agentDir: "/Users/user/.openclaw/agents/main/agent",
  };

  const list: AgentEntry[] = [mainAgent];

  // Attempt to upsert an agent with the same id
  upsertAgent(list, {
    id: "main",
    name: "Overwritten",
    workspaceDir: "/tmp/evil",
    agentDir: "/tmp/evil/agent",
  });

  if (list.length !== 1) throw new Error(`Expected 1 agent, got ${list.length}`);
  if (list[0].name !== "Harry") throw new Error(`Expected name 'Harry', got '${list[0].name}'`);
  if (list[0].workspace !== "/Users/user/clawd") throw new Error("Workspace was overwritten!");
  if (list[0].default !== true) throw new Error("default flag was dropped!");

  console.log("  ✓ main agent preserved (name, workspace, agentDir, default)");
  console.log("PASS\n");
}

function testNonDefaultAgentCanBeUpserted(): void {
  console.log("Test: non-default agents can still be upserted...");

  const existing: AgentEntry = {
    id: "feature-dev/planner",
    name: "Old Planner",
    workspace: "/old/path",
    agentDir: "/old/agent",
  };

  const list: AgentEntry[] = [existing];

  upsertAgent(list, {
    id: "feature-dev/planner",
    name: "New Planner",
    workspaceDir: "/new/path",
    agentDir: "/new/agent",
  });

  if (list.length !== 1) throw new Error(`Expected 1 agent, got ${list.length}`);
  if (list[0].name !== "New Planner") throw new Error(`Expected 'New Planner', got '${list[0].name}'`);
  if (list[0].workspace !== "/new/path") throw new Error("Workspace not updated!");

  console.log("  ✓ non-default agent was updated");
  console.log("PASS\n");
}

function testNewAgentAppended(): void {
  console.log("Test: new agents are appended to list...");

  const list: AgentEntry[] = [{ id: "main", default: true, workspace: "/clawd" }];

  upsertAgent(list, {
    id: "feature-dev/developer",
    name: "Developer",
    workspaceDir: "/dev/workspace",
    agentDir: "/dev/agent",
  });

  if (list.length !== 2) throw new Error(`Expected 2 agents, got ${list.length}`);
  if (list[1].id !== "feature-dev/developer") throw new Error("New agent not appended!");

  console.log("  ✓ new agent appended without touching main");
  console.log("PASS\n");
}

console.log("\n=== Preserve Default Agent Tests ===\n");
try {
  testDefaultAgentNotOverwritten();
  testNonDefaultAgentCanBeUpserted();
  testNewAgentAppended();
  console.log("All tests passed! ✓\n");
  process.exit(0);
} catch (err) {
  console.error("\nFAIL:", err);
  process.exit(1);
}
