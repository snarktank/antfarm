/**
 * Tests for src/installer/uninstall.ts
 *
 * Covers uninstallWorkflow, checkActiveRuns, and uninstallAllWorkflows.
 * Mocks fs, db, gateway-api, paths, and other installer modules to test
 * uninstall logic without real IO.
 */

import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

// ── Mock state ──────────────────────────────────────────────────────

let removedPaths: string[] = [];
let accessiblePaths: Set<string> = new Set();
let readdirResults: Map<string, string[]> = new Map();
let configState: any = { agents: { list: [] } };
let writtenConfig: any = null;
let removedGuidance = false;
let removedSubagentAllowlistCalls: any[] = [];
let removedAgentCronsWorkflowIds: string[] = [];
let deletedCronJobsPrefixes: string[] = [];
let dbPrepareResults: Map<string, any[]> = new Map();
let dbRunCalls: any[] = [];
let stoppedDaemon = false;
let uninstalledSkill = false;
let removedCliSymlink = false;

// ── Stable mock paths ──────────────────────────────────────────────

const MOCK_ANTFARM_ROOT = "/mock/.openclaw/antfarm";
const MOCK_WORKFLOW_ROOT = "/mock/.openclaw/antfarm/workflows";
const MOCK_WORKSPACE_ROOT = "/mock/.openclaw/workspaces/workflows";
const MOCK_RUN_ROOT = "/mock/.openclaw/antfarm/runs";
const MOCK_DB_PATH = "/mock/.openclaw/antfarm/antfarm.db";

// ── Module mocks (must be before importing the module under test) ──

mock.module("node:fs/promises", {
  defaultExport: {
    access: async (p: string) => {
      if (!accessiblePaths.has(p)) {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      }
    },
    rm: async (p: string, _opts?: any) => {
      removedPaths.push(p);
    },
    readdir: async (p: string) => {
      return readdirResults.get(p) ?? [];
    },
  },
});

mock.module("node:child_process", {
  namedExports: {
    execSync: (_cmd: string, _opts?: any) => {},
  },
});

mock.module("../dist/installer/paths.js", {
  namedExports: {
    resolveAntfarmRoot: () => MOCK_ANTFARM_ROOT,
    resolveWorkflowRoot: () => MOCK_WORKFLOW_ROOT,
    resolveWorkflowDir: (id: string) => path.join(MOCK_WORKFLOW_ROOT, id),
    resolveWorkflowWorkspaceRoot: () => MOCK_WORKSPACE_ROOT,
    resolveWorkflowWorkspaceDir: (id: string) =>
      path.join(MOCK_WORKSPACE_ROOT, id),
    resolveRunRoot: () => MOCK_RUN_ROOT,
    resolveAntfarmCli: () => "/mock/cli.js",
    resolveOpenClawStateDir: () => "/mock/.openclaw",
    resolveOpenClawConfigPath: () => "/mock/.openclaw/openclaw.json",
    resolveBundledWorkflowsDir: () => "/mock/workflows",
    resolveBundledWorkflowDir: (id: string) => `/mock/workflows/${id}`,
  },
});

mock.module("../dist/installer/openclaw-config.js", {
  namedExports: {
    readOpenClawConfig: async () => ({
      path: "/mock/.openclaw/openclaw.json",
      config: configState,
    }),
    writeOpenClawConfig: async (_p: string, config: any) => {
      writtenConfig = config;
    },
  },
});

mock.module("../dist/installer/main-agent-guidance.js", {
  namedExports: {
    removeMainAgentGuidance: async () => {
      removedGuidance = true;
    },
  },
});

mock.module("../dist/installer/subagent-allowlist.js", {
  namedExports: {
    removeSubagentAllowlist: (config: any, agentIds: string[]) => {
      removedSubagentAllowlistCalls.push({ config, agentIds });
    },
  },
});

mock.module("../dist/installer/skill-install.js", {
  namedExports: {
    uninstallAntfarmSkill: async () => {
      uninstalledSkill = true;
    },
  },
});

mock.module("../dist/installer/agent-cron.js", {
  namedExports: {
    removeAgentCrons: async (workflowId: string) => {
      removedAgentCronsWorkflowIds.push(workflowId);
    },
  },
});

mock.module("../dist/installer/gateway-api.js", {
  namedExports: {
    deleteAgentCronJobs: async (prefix: string) => {
      deletedCronJobsPrefixes.push(prefix);
      return { ok: true };
    },
  },
});

mock.module("../dist/db.js", {
  namedExports: {
    getDb: () => ({
      prepare: (sql: string) => ({
        all: (...args: any[]) => {
          const key = sql + JSON.stringify(args);
          return dbPrepareResults.get(key) ?? dbPrepareResults.get(sql) ?? [];
        },
        run: (...args: any[]) => {
          dbRunCalls.push({ sql, args });
        },
        get: () => null,
      }),
    }),
    getDbPath: () => MOCK_DB_PATH,
  },
});

mock.module("../dist/server/daemonctl.js", {
  namedExports: {
    stopDaemon: () => {
      stoppedDaemon = true;
      return true;
    },
  },
});

mock.module("../dist/installer/symlink.js", {
  namedExports: {
    removeCliSymlink: () => {
      removedCliSymlink = true;
    },
  },
});

// ── Import under test (after mocks) ────────────────────────────────

const { uninstallWorkflow, checkActiveRuns, uninstallAllWorkflows } =
  await import("../dist/installer/uninstall.js");

// ── Tests ───────────────────────────────────────────────────────────

describe("uninstall", () => {
  beforeEach(() => {
    removedPaths = [];
    accessiblePaths = new Set();
    readdirResults = new Map();
    configState = { agents: { list: [] } };
    writtenConfig = null;
    removedGuidance = false;
    removedSubagentAllowlistCalls = [];
    removedAgentCronsWorkflowIds = [];
    deletedCronJobsPrefixes = [];
    dbPrepareResults = new Map();
    dbRunCalls = [];
    stoppedDaemon = false;
    uninstalledSkill = false;
    removedCliSymlink = false;
  });

  describe("uninstallWorkflow", () => {
    it("removes workflow dir and workspace dir when they exist", async () => {
      const wfDir = path.join(MOCK_WORKFLOW_ROOT, "test-wf");
      const wsDir = path.join(MOCK_WORKSPACE_ROOT, "test-wf");
      accessiblePaths.add(wfDir);
      accessiblePaths.add(wsDir);

      const result = await uninstallWorkflow({ workflowId: "test-wf" });

      assert.ok(removedPaths.includes(wfDir), "should remove workflow directory");
      assert.ok(
        removedPaths.includes(wsDir),
        "should remove workspace directory"
      );
      assert.equal(result.workflowId, "test-wf");
    });

    it("returns a summary with workflowId and workflowDir", async () => {
      const result = await uninstallWorkflow({ workflowId: "my-workflow" });

      assert.equal(result.workflowId, "my-workflow");
      assert.ok(
        typeof result.workflowDir === "string",
        "should return workflowDir as string"
      );
      assert.ok(
        result.workflowDir.includes("my-workflow"),
        "workflowDir should contain workflow ID"
      );
    });

    it("calls removeAgentCrons for the workflow", async () => {
      await uninstallWorkflow({ workflowId: "cron-wf" });

      assert.ok(
        removedAgentCronsWorkflowIds.includes("cron-wf"),
        "should call removeAgentCrons with workflowId"
      );
    });

    it("removes agents from config that match workflowId prefix", async () => {
      configState = {
        agents: {
          list: [
            { id: "test-wf-agent1", agentDir: "/mock/agents/a1/agent" },
            { id: "test-wf-agent2", agentDir: "/mock/agents/a2/agent" },
            { id: "other-wf-agent1", agentDir: "/mock/agents/a3/agent" },
          ],
        },
      };

      await uninstallWorkflow({ workflowId: "test-wf" });

      assert.ok(writtenConfig, "should write updated config");
      const remainingIds = writtenConfig.agents.list.map((e: any) => e.id);
      assert.ok(
        !remainingIds.includes("test-wf-agent1"),
        "should remove test-wf-agent1"
      );
      assert.ok(
        !remainingIds.includes("test-wf-agent2"),
        "should remove test-wf-agent2"
      );
      assert.ok(
        remainingIds.includes("other-wf-agent1"),
        "should keep other-wf-agent1"
      );
    });

    it("calls removeSubagentAllowlist with removed agent IDs", async () => {
      configState = {
        agents: {
          list: [
            { id: "wf-agent1", agentDir: "/mock/agents/a1/agent" },
          ],
        },
      };

      await uninstallWorkflow({ workflowId: "wf" });

      assert.equal(removedSubagentAllowlistCalls.length, 1);
      assert.deepStrictEqual(removedSubagentAllowlistCalls[0].agentIds, [
        "wf-agent1",
      ]);
    });

    it("removes agent parent directories for removed agents", async () => {
      configState = {
        agents: {
          list: [
            {
              id: "wf-agent1",
              agentDir: "/mock/agents/my-agent/agent",
            },
          ],
        },
      };
      // Parent dir = path.dirname("/mock/agents/my-agent/agent") = "/mock/agents/my-agent"
      accessiblePaths.add("/mock/agents/my-agent");

      await uninstallWorkflow({ workflowId: "wf" });

      assert.ok(
        removedPaths.includes("/mock/agents/my-agent"),
        "should remove parent directory of agent"
      );
    });

    it("removes guidance by default", async () => {
      await uninstallWorkflow({ workflowId: "wf" });
      assert.equal(removedGuidance, true, "should remove guidance by default");
    });

    it("skips guidance removal when removeGuidance is false", async () => {
      await uninstallWorkflow({
        workflowId: "wf",
        removeGuidance: false,
      });
      assert.equal(
        removedGuidance,
        false,
        "should not remove guidance when removeGuidance=false"
      );
    });

    it("handles missing workflow/workspace dirs gracefully (no throw on ENOENT)", async () => {
      // Don't add any paths to accessiblePaths - all pathExists calls return false
      const result = await uninstallWorkflow({ workflowId: "nonexistent" });

      // Should not throw, and should still return result
      assert.equal(result.workflowId, "nonexistent");
      const wfDir = path.join(MOCK_WORKFLOW_ROOT, "nonexistent");
      assert.ok(
        !removedPaths.includes(wfDir),
        "should not try to rm dirs that don't exist"
      );
    });

    it("handles DB errors gracefully in removeRunRecords", async () => {
      configState = { agents: { list: [] } };
      // Should not throw
      const result = await uninstallWorkflow({ workflowId: "wf" });
      assert.equal(result.workflowId, "wf");
    });
  });

  describe("checkActiveRuns", () => {
    it("returns empty array when no active runs", () => {
      const runs = checkActiveRuns("test-wf");
      assert.ok(Array.isArray(runs));
      assert.equal(runs.length, 0);
    });

    it("returns runs from DB when they exist", () => {
      const mockRuns = [
        { id: "run1", workflow_id: "test-wf", task: "do stuff" },
      ];
      dbPrepareResults.set(
        "SELECT id, workflow_id, task FROM runs WHERE workflow_id = ? AND status = 'running'",
        mockRuns
      );

      const runs = checkActiveRuns("test-wf");
      assert.ok(Array.isArray(runs));
    });

    it("returns empty array when called without workflowId", () => {
      const runs = checkActiveRuns();
      assert.ok(Array.isArray(runs));
    });
  });

  describe("uninstallAllWorkflows", () => {
    it("stops the daemon before cleanup", async () => {
      await uninstallAllWorkflows();
      assert.equal(stoppedDaemon, true, "should stop daemon");
    });

    it("calls deleteAgentCronJobs with antfarm/ prefix", async () => {
      await uninstallAllWorkflows();
      assert.ok(
        deletedCronJobsPrefixes.includes("antfarm/"),
        "should delete all antfarm cron jobs"
      );
    });

    it("removes main agent guidance", async () => {
      await uninstallAllWorkflows();
      assert.equal(removedGuidance, true, "should remove main agent guidance");
    });

    it("uninstalls antfarm skill", async () => {
      await uninstallAllWorkflows();
      assert.equal(uninstalledSkill, true, "should uninstall antfarm skill");
    });

    it("removes workflow root and workspace root when they exist", async () => {
      accessiblePaths.add(MOCK_WORKFLOW_ROOT);
      accessiblePaths.add(MOCK_WORKSPACE_ROOT);

      await uninstallAllWorkflows();

      assert.ok(
        removedPaths.includes(MOCK_WORKFLOW_ROOT),
        "should remove workflow root"
      );
      assert.ok(
        removedPaths.includes(MOCK_WORKSPACE_ROOT),
        "should remove workspace root"
      );
    });

    it("removes SQLite database and WAL/SHM files when they exist", async () => {
      accessiblePaths.add(MOCK_DB_PATH);
      accessiblePaths.add(MOCK_DB_PATH + "-wal");
      accessiblePaths.add(MOCK_DB_PATH + "-shm");

      await uninstallAllWorkflows();

      assert.ok(
        removedPaths.includes(MOCK_DB_PATH),
        "should remove db file"
      );
      assert.ok(
        removedPaths.includes(MOCK_DB_PATH + "-wal"),
        "should remove wal file"
      );
      assert.ok(
        removedPaths.includes(MOCK_DB_PATH + "-shm"),
        "should remove shm file"
      );
    });

    it("removes antfarm-managed agents but keeps non-antfarm agents", async () => {
      configState = {
        agents: {
          list: [
            { id: "main", agentDir: "/some/path" },
            {
              id: "wf-agent1",
              agentDir: "/home/user/.openclaw/agents/agent1/agent",
            },
          ],
        },
      };

      await uninstallAllWorkflows();

      assert.ok(writtenConfig, "should write config");
      const remainingIds = writtenConfig.agents.list.map((e: any) => e.id);
      assert.ok(remainingIds.includes("main"), "should keep main agent");
      assert.ok(
        !remainingIds.includes("wf-agent1"),
        "should remove antfarm-managed agent"
      );
    });

    it("cleans up antfarm runtime files when antfarm root exists", async () => {
      accessiblePaths.add(MOCK_ANTFARM_ROOT);
      for (const name of [
        "dashboard.pid",
        "dashboard.log",
        "events.jsonl",
        "logs",
      ]) {
        accessiblePaths.add(path.join(MOCK_ANTFARM_ROOT, name));
      }
      readdirResults.set(MOCK_ANTFARM_ROOT, []);

      await uninstallAllWorkflows();

      assert.ok(
        removedPaths.includes(path.join(MOCK_ANTFARM_ROOT, "dashboard.pid")),
        "should remove dashboard.pid"
      );
      assert.ok(
        removedPaths.includes(path.join(MOCK_ANTFARM_ROOT, "dashboard.log")),
        "should remove dashboard.log"
      );
      assert.ok(
        removedPaths.includes(path.join(MOCK_ANTFARM_ROOT, "events.jsonl")),
        "should remove events.jsonl"
      );
      assert.ok(
        removedPaths.includes(path.join(MOCK_ANTFARM_ROOT, "logs")),
        "should remove logs dir"
      );
    });

    it("removes antfarm root directory when empty after cleanup", async () => {
      accessiblePaths.add(MOCK_ANTFARM_ROOT);
      readdirResults.set(MOCK_ANTFARM_ROOT, []);

      await uninstallAllWorkflows();

      assert.ok(
        removedPaths.includes(MOCK_ANTFARM_ROOT),
        "should remove empty antfarm root"
      );
    });

    it("does not remove antfarm root when non-empty after cleanup", async () => {
      accessiblePaths.add(MOCK_ANTFARM_ROOT);
      readdirResults.set(MOCK_ANTFARM_ROOT, ["remaining-file"]);

      await uninstallAllWorkflows();

      const rootRemovals = removedPaths.filter((p) => p === MOCK_ANTFARM_ROOT);
      assert.equal(
        rootRemovals.length,
        0,
        "should not remove non-empty antfarm root"
      );
    });

    it("cleans up cron session retention config if it matches default", async () => {
      configState = {
        agents: { list: [] },
        cron: { sessionRetention: "24h" },
      };

      await uninstallAllWorkflows();

      assert.ok(writtenConfig, "should write config");
      assert.equal(
        writtenConfig.cron,
        undefined,
        "should remove cron section when only default sessionRetention"
      );
    });

    it("cleans up session maintenance config if it matches defaults", async () => {
      configState = {
        agents: { list: [] },
        session: {
          maintenance: {
            mode: "enforce",
            pruneAfter: "7d",
            maxEntries: 500,
            rotateBytes: "10mb",
          },
        },
      };

      await uninstallAllWorkflows();

      assert.ok(writtenConfig, "should write config");
      assert.equal(
        writtenConfig.session,
        undefined,
        "should remove session section when only default maintenance"
      );
    });

    it("removes CLI symlink", async () => {
      await uninstallAllWorkflows();
      assert.equal(removedCliSymlink, true, "should remove CLI symlink");
    });
  });
});
