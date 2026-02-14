import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getDb } from "../dist/db.js";
import { readProgressFile } from "../dist/installer/step-ops.js";

describe("readProgressFile security regression", () => {
  it("should reject symlink payloads attempting path traversal", () => {
    // 1. Setup mock workspace and db entry
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-test-"));
    const agentWorkspace = path.join(tmpDir, "workspace");
    fs.mkdirSync(agentWorkspace, { recursive: true });

    // Mock openclaw.json
    const ocDir = path.join(os.homedir(), ".openclaw");
    if (!fs.existsSync(ocDir)) fs.mkdirSync(ocDir, { recursive: true });
    const ocConfigPath = path.join(ocDir, "openclaw.json");
    
    let originalConfig = null;
    if (fs.existsSync(ocConfigPath)) {
        originalConfig = fs.readFileSync(ocConfigPath, "utf-8");
    }

    const mockConfig = {
      agents: {
        list: [
          { id: "test-agent", workspace: agentWorkspace }
        ]
      }
    };
    fs.writeFileSync(ocConfigPath, JSON.stringify(mockConfig));

    try {
      const db = getDb();
      const runId = "test-run-symlink-" + Math.random().toString(36).slice(2);
      const stepId = "test-step-symlink-" + Math.random().toString(36).slice(2);

      const now = new Date().toISOString();
      db.prepare("INSERT INTO runs (id, workflow_id, task, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
        .run(runId, "test-workflow", "test-task", now, now);

      // Insert mock step
      db.prepare("INSERT INTO steps (id, step_id, run_id, type, agent_id, status, step_index, input_template, expects, created_at, updated_at) VALUES (?, ?, ?, 'loop', 'test-agent', 'running', 0, '', '', ?, ?)")
        .run(stepId, stepId, runId, now, now);

      // 2. Create the malicious symlink
      const secretFile = path.join(tmpDir, "secret.txt");
      fs.writeFileSync(secretFile, "PRIVATE_DATA");
      
      const symlinkPath = path.join(agentWorkspace, `progress-${runId}.txt`);
      fs.symlinkSync(secretFile, symlinkPath);

      // 3. Execution
      const content = readProgressFile(runId);

      // 4. Verification
      assert.notEqual(content, "PRIVATE_DATA", "Should not read content from symlink target outside workspace");
      // It should return "(no progress file)" or "(no progress yet)" if we add a check that rejects symlinks
    } finally {
      // Cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true });
      if (originalConfig) {
          fs.writeFileSync(ocConfigPath, originalConfig);
      } else {
          fs.unlinkSync(ocConfigPath);
      }
    }
  });
});
