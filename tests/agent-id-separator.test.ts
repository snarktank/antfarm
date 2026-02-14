/**
 * Tests for agent ID separator fix (issue #143).
 *
 * Verifies that the double-hyphen separator ("--") is used between workflow
 * and agent IDs, enabling unambiguous parsing and preventing collisions.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AGENT_ID_SEPARATOR } from "../dist/installer/types.js";
import { buildPollingPrompt } from "../dist/installer/agent-cron.js";

describe("AGENT_ID_SEPARATOR", () => {
  it("is a double hyphen", () => {
    assert.strictEqual(AGENT_ID_SEPARATOR, "--");
  });
});

describe("agent ID construction uses double-hyphen separator", () => {
  it("buildPollingPrompt uses -- separator in step claim command", () => {
    const prompt = buildPollingPrompt("bug-fix", "setup");
    assert.ok(prompt.includes('step claim "bug-fix--setup"'), "should use -- separator");
    assert.ok(!prompt.includes('step claim "bug-fix-setup"'), "should NOT use single-hyphen separator");
  });

  it("buildPollingPrompt uses -- separator in sessions_spawn agentId", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer");
    assert.ok(prompt.includes('"feature-dev--developer"'), "should use -- separator in agentId");
  });

  it("buildPollingPrompt uses -- separator in step peek command", () => {
    const prompt = buildPollingPrompt("security-audit", "scanner");
    assert.ok(prompt.includes('step peek "security-audit--scanner"'), "should use -- separator in peek");
  });

  it("disambiguates workflows with overlapping hyphenated names", () => {
    // With single-hyphen: "bug-fix-pr" is ambiguous (workflow "bug" + agent "fix-pr"?)
    // With double-hyphen: "bug-fix--pr" is unambiguous
    const prompt = buildPollingPrompt("bug-fix", "pr");
    assert.ok(prompt.includes('"bug-fix--pr"'));
    // Verify it does NOT contain the ambiguous single-hyphen form in claim commands
    assert.ok(!prompt.includes('claim "bug-fix-pr"'));
  });
});

describe("agent ID parsing is unambiguous with double-hyphen", () => {
  it("can extract workflow and agent from composite ID", () => {
    const compositeId = `bug-fix${AGENT_ID_SEPARATOR}setup`;
    const [workflowId, agentId] = compositeId.split(AGENT_ID_SEPARATOR);
    assert.strictEqual(workflowId, "bug-fix");
    assert.strictEqual(agentId, "setup");
  });

  it("handles agent IDs containing single hyphens", () => {
    const compositeId = `my-workflow${AGENT_ID_SEPARATOR}my-agent`;
    const parts = compositeId.split(AGENT_ID_SEPARATOR);
    assert.strictEqual(parts.length, 2);
    assert.strictEqual(parts[0], "my-workflow");
    assert.strictEqual(parts[1], "my-agent");
  });
});
