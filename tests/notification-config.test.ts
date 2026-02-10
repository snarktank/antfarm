/**
 * Tests that workflow.yml notifications.sessionTarget is parsed correctly.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";

describe("notifications config", () => {
  it("parses sessionTarget from workflow.yml", async () => {
    const tmpDir = path.join(os.tmpdir(), `antfarm-notif-test-${Date.now()}`);
    await fs.mkdir(path.join(tmpDir, "agents", "a1"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "agents", "a1", "AGENTS.md"), "# Agent");

    const yml = `
id: test-notif
name: Notification Test
version: 1

notifications:
  sessionTarget: discord-general

agents:
  - id: a1
    name: Agent One
    workspace:
      baseDir: agents/a1
      files:
        AGENTS.md: agents/a1/AGENTS.md

steps:
  - id: s1
    agent: a1
    input: "Do the thing"
    expects: "DONE"
`;
    await fs.writeFile(path.join(tmpDir, "workflow.yml"), yml);

    const spec = await loadWorkflowSpec(tmpDir);
    assert.equal(spec.notifications?.sessionTarget, "discord-general");

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("works without notifications config", async () => {
    const tmpDir = path.join(os.tmpdir(), `antfarm-notif-test2-${Date.now()}`);
    await fs.mkdir(path.join(tmpDir, "agents", "a1"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "agents", "a1", "AGENTS.md"), "# Agent");

    const yml = `
id: test-no-notif
name: No Notification
version: 1

agents:
  - id: a1
    name: Agent One
    workspace:
      baseDir: agents/a1
      files:
        AGENTS.md: agents/a1/AGENTS.md

steps:
  - id: s1
    agent: a1
    input: "Do the thing"
    expects: "DONE"
`;
    await fs.writeFile(path.join(tmpDir, "workflow.yml"), yml);

    const spec = await loadWorkflowSpec(tmpDir);
    assert.equal(spec.notifications, undefined);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
