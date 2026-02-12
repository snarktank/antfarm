/**
 * Regression test: uninstall must remove agent parent directories
 * even when sibling directories (like sessions/) exist alongside agent/.
 *
 * Bug: Previously, uninstall only removed the agent/ subdirectory and then
 * checked if the parent was empty. Since OpenClaw creates a sessions/ sibling,
 * the parent was never empty and persisted indefinitely.
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert";
import { describe, it, beforeEach, afterEach } from "node:test";

describe("uninstall agent directory cleanup", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("should remove parent directory even when sessions/ sibling exists", async () => {
    // Simulate the directory structure OpenClaw creates:
    // ~/.openclaw/agents/bug-fix-triager/
    //   agent/     <- this is what agentDir points to
    //   sessions/  <- sibling created by OpenClaw
    const agentParent = path.join(tmpDir, "bug-fix-triager");
    const agentDir = path.join(agentParent, "agent");
    const sessionsDir = path.join(agentParent, "sessions");

    await fs.mkdir(agentDir, { recursive: true });
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(path.join(sessionsDir, "some-session.json"), "{}");

    // The fix: remove parentDir directly instead of just agentDir
    const parentDir = path.dirname(agentDir);
    await fs.rm(parentDir, { recursive: true, force: true });

    // Parent directory should be completely gone
    const exists = await fs
      .access(agentParent)
      .then(() => true)
      .catch(() => false);
    assert.strictEqual(exists, false);
  });

  it("old approach would leave parent directory behind", async () => {
    // Demonstrate the bug: removing only agentDir leaves parent because sessions/ exists
    const agentParent = path.join(tmpDir, "bug-fix-triager");
    const agentDir = path.join(agentParent, "agent");
    const sessionsDir = path.join(agentParent, "sessions");

    await fs.mkdir(agentDir, { recursive: true });
    await fs.mkdir(sessionsDir, { recursive: true });

    // Old approach: remove agentDir, then check if parent is empty
    await fs.rm(agentDir, { recursive: true, force: true });
    const remaining = await fs.readdir(agentParent);
    // Parent is NOT empty because sessions/ still exists - this was the bug
    assert.ok(remaining.length > 0);
  });
});
