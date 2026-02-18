/**
 * installer/openclaw-config.ts unit tests
 *
 * Tests readOpenClawConfig() and writeOpenClawConfig() with mocked
 * node:fs/promises and paths module so no real filesystem access occurs.
 */

import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── Mutable mock state ──────────────────────────────────────────────

let fakeFileContent: string | null = null;
let fakeReadError: Error | null = null;
let lastWrittenPath: string | null = null;
let lastWrittenContent: string | null = null;

const FAKE_CONFIG_PATH = "/fake/home/.openclaw/openclaw.json";

// ── Module mocks ────────────────────────────────────────────────────

mock.module("node:fs/promises", {
  defaultExport: {
    readFile: async (_path: string, _enc: string) => {
      if (fakeReadError) throw fakeReadError;
      if (fakeFileContent === null) {
        const err = new Error(`ENOENT: no such file or directory, open '${_path}'`) as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
      return fakeFileContent;
    },
    writeFile: async (path: string, content: string, _enc: string) => {
      lastWrittenPath = path;
      lastWrittenContent = content;
    },
  },
});

mock.module("../dist/installer/paths.js", {
  namedExports: {
    resolveOpenClawConfigPath: () => FAKE_CONFIG_PATH,
    resolveOpenClawStateDir: () => "/fake/home/.openclaw",
    resolveBundledWorkflowsDir: () => "/fake/workflows",
    resolveBundledWorkflowDir: (id: string) => `/fake/workflows/${id}`,
    resolveAntfarmRoot: () => "/fake/home/.openclaw/antfarm",
    resolveWorkflowRoot: () => "/fake/home/.openclaw/antfarm/workflows",
    resolveWorkflowDir: (id: string) => `/fake/home/.openclaw/antfarm/workflows/${id}`,
    resolveWorkflowWorkspaceRoot: () => "/fake/home/.openclaw/workspaces/workflows",
    resolveWorkflowWorkspaceDir: (id: string) => `/fake/home/.openclaw/workspaces/workflows/${id}`,
    resolveRunRoot: () => "/fake/home/.openclaw/antfarm/runs",
    resolveAntfarmCli: () => "/fake/dist/cli/cli.js",
  },
});

// Import after mocks
const { readOpenClawConfig, writeOpenClawConfig } =
  await import("../dist/installer/openclaw-config.js");

// ── Tests ───────────────────────────────────────────────────────────

describe("installer/openclaw-config", () => {
  beforeEach(() => {
    fakeFileContent = null;
    fakeReadError = null;
    lastWrittenPath = null;
    lastWrittenContent = null;
  });

  // ── readOpenClawConfig ──────────────────────────────────────────

  describe("readOpenClawConfig", () => {
    it("reads and parses config when file exists with valid JSON", async () => {
      fakeFileContent = JSON.stringify({
        cron: { sessionRetention: "7d" },
        session: { maintenance: { mode: "enforce" } },
      });

      const { path, config } = await readOpenClawConfig();

      assert.equal(path, FAKE_CONFIG_PATH);
      assert.equal(config.cron?.sessionRetention, "7d");
      assert.equal(config.session?.maintenance?.mode, "enforce");
    });

    it("reads agents config when present", async () => {
      fakeFileContent = JSON.stringify({
        agents: {
          defaults: { subagents: { allowAgents: ["opus", "sonnet"] } },
          list: [{ name: "test-agent" }],
        },
      });

      const { config } = await readOpenClawConfig();

      assert.deepEqual(config.agents?.defaults?.subagents?.allowAgents, [
        "opus",
        "sonnet",
      ]);
      assert.equal(config.agents?.list?.length, 1);
    });

    it("handles JSON5 syntax (trailing commas, comments)", async () => {
      // JSON5 supports trailing commas and comments
      fakeFileContent = `{
        // session config
        "cron": { "sessionRetention": "30d", },
      }`;

      const { config } = await readOpenClawConfig();
      assert.equal(config.cron?.sessionRetention, "30d");
    });

    it("returns empty config object when file contains empty JSON object", async () => {
      fakeFileContent = "{}";

      const { config } = await readOpenClawConfig();

      assert.deepEqual(config, {});
      assert.equal(config.cron, undefined);
      assert.equal(config.session, undefined);
      assert.equal(config.agents, undefined);
    });

    it("throws when config file is missing (ENOENT)", async () => {
      fakeFileContent = null; // triggers ENOENT

      await assert.rejects(
        () => readOpenClawConfig(),
        (err: Error) => {
          assert.ok(err.message.includes("Failed to read OpenClaw config"));
          assert.ok(err.message.includes(FAKE_CONFIG_PATH));
          assert.ok(err.message.includes("ENOENT"));
          return true;
        }
      );
    });

    it("throws when config file has malformed JSON", async () => {
      fakeFileContent = "{ invalid json !!!";

      await assert.rejects(
        () => readOpenClawConfig(),
        (err: Error) => {
          assert.ok(err.message.includes("Failed to read OpenClaw config"));
          assert.ok(err.message.includes(FAKE_CONFIG_PATH));
          return true;
        }
      );
    });

    it("throws with wrapped message for generic read errors", async () => {
      fakeReadError = new Error("Permission denied");

      await assert.rejects(
        () => readOpenClawConfig(),
        (err: Error) => {
          assert.ok(err.message.includes("Failed to read OpenClaw config"));
          assert.ok(err.message.includes("Permission denied"));
          return true;
        }
      );
    });

    it("handles non-Error throw values gracefully", async () => {
      fakeReadError = "string error" as unknown as Error;

      await assert.rejects(
        () => readOpenClawConfig(),
        (err: Error) => {
          assert.ok(err.message.includes("Failed to read OpenClaw config"));
          return true;
        }
      );
    });

    it("reads session maintenance config with all fields", async () => {
      fakeFileContent = JSON.stringify({
        session: {
          maintenance: {
            mode: "warn",
            pruneAfter: "14d",
            pruneDays: 14,
            maxEntries: 1000,
            rotateBytes: "50MB",
          },
        },
      });

      const { config } = await readOpenClawConfig();

      assert.equal(config.session?.maintenance?.mode, "warn");
      assert.equal(config.session?.maintenance?.pruneAfter, "14d");
      assert.equal(config.session?.maintenance?.pruneDays, 14);
      assert.equal(config.session?.maintenance?.maxEntries, 1000);
      assert.equal(config.session?.maintenance?.rotateBytes, "50MB");
    });
  });

  // ── writeOpenClawConfig ─────────────────────────────────────────

  describe("writeOpenClawConfig", () => {
    it("writes JSON with 2-space indentation and trailing newline", async () => {
      const config = { cron: { sessionRetention: "7d" } };

      await writeOpenClawConfig("/some/path.json", config);

      assert.equal(lastWrittenPath, "/some/path.json");
      const expected = JSON.stringify(config, null, 2) + "\n";
      assert.equal(lastWrittenContent, expected);
    });

    it("writes empty config object", async () => {
      await writeOpenClawConfig("/some/path.json", {});

      assert.equal(lastWrittenContent, "{}\n");
    });

    it("preserves all config fields through serialization", async () => {
      const config = {
        cron: { sessionRetention: false as const },
        session: { maintenance: { mode: "enforce" as const, pruneDays: 7 } },
        agents: {
          defaults: { subagents: { allowAgents: ["opus"] } },
          list: [{ name: "a1" }],
        },
      };

      await writeOpenClawConfig("/out.json", config);

      const parsed = JSON.parse(lastWrittenContent!);
      assert.deepEqual(parsed, config);
    });
  });
});
