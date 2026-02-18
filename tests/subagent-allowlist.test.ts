/**
 * installer/subagent-allowlist.ts unit tests
 *
 * Tests addSubagentAllowlist() and removeSubagentAllowlist() — pure logic
 * functions with no I/O dependencies.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { addSubagentAllowlist, removeSubagentAllowlist } = await import(
  "../dist/installer/subagent-allowlist.js"
);

type Config = Record<string, unknown> & {
  tools?: {
    agentToAgent?: {
      enabled?: boolean;
      allow?: string[];
    };
  };
};

describe("addSubagentAllowlist", () => {
  it("no-op when agentIds is empty", () => {
    const config: Config = {};
    addSubagentAllowlist(config, []);
    assert.deepStrictEqual(config, {});
  });

  it("adds agents to empty allow list with enabled=true", () => {
    const config: Config = {};
    addSubagentAllowlist(config, ["agent-a", "agent-b"]);
    assert.deepStrictEqual(config.tools?.agentToAgent, {
      enabled: true,
      allow: ["agent-a", "agent-b"],
    });
  });

  it("deduplicates agents when called twice with same IDs", () => {
    const config: Config = {};
    addSubagentAllowlist(config, ["agent-a", "agent-b"]);
    addSubagentAllowlist(config, ["agent-b", "agent-c"]);
    assert.deepStrictEqual(config.tools?.agentToAgent?.allow, [
      "agent-a",
      "agent-b",
      "agent-c",
    ]);
  });

  it("short-circuits when '*' is already in allow list", () => {
    const config: Config = {
      tools: { agentToAgent: { enabled: true, allow: ["*"] } },
    };
    addSubagentAllowlist(config, ["agent-a"]);
    assert.deepStrictEqual(config.tools?.agentToAgent?.allow, ["*"]);
  });
});

describe("removeSubagentAllowlist", () => {
  it("removes specified agents from allow list", () => {
    const config: Config = {
      tools: {
        agentToAgent: { enabled: true, allow: ["agent-a", "agent-b", "agent-c"] },
      },
    };
    removeSubagentAllowlist(config, ["agent-b"]);
    assert.deepStrictEqual(config.tools?.agentToAgent?.allow, [
      "agent-a",
      "agent-c",
    ]);
  });

  it("sets allow to undefined when all agents removed", () => {
    const config: Config = {
      tools: { agentToAgent: { enabled: true, allow: ["agent-a"] } },
    };
    removeSubagentAllowlist(config, ["agent-a"]);
    assert.strictEqual(config.tools?.agentToAgent?.allow, undefined);
  });

  it("short-circuits when '*' is in allow list", () => {
    const config: Config = {
      tools: { agentToAgent: { enabled: true, allow: ["*", "agent-a"] } },
    };
    removeSubagentAllowlist(config, ["agent-a"]);
    assert.deepStrictEqual(config.tools?.agentToAgent?.allow, ["*", "agent-a"]);
  });

  it("no-op when agentIds is empty", () => {
    const config: Config = {
      tools: { agentToAgent: { enabled: true, allow: ["agent-a"] } },
    };
    removeSubagentAllowlist(config, []);
    assert.deepStrictEqual(config.tools?.agentToAgent?.allow, ["agent-a"]);
  });
});
