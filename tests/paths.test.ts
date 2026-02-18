/**
 * installer/paths.ts unit tests
 *
 * Tests all exported path-construction functions with mocked os.homedir()
 * and controlled environment variables so no real filesystem paths are used.
 */

import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

// ── Constants ────────────────────────────────────────────────────────

const FAKE_HOME = "/fake/home";

// ── Module mocks ─────────────────────────────────────────────────────

mock.module("node:os", {
  defaultExport: {
    homedir: () => FAKE_HOME,
  },
});

// Import after mocks are set up
const {
  resolveBundledWorkflowsDir,
  resolveBundledWorkflowDir,
  resolveOpenClawStateDir,
  resolveOpenClawConfigPath,
  resolveAntfarmRoot,
  resolveWorkflowRoot,
  resolveWorkflowDir,
  resolveWorkflowWorkspaceRoot,
  resolveWorkflowWorkspaceDir,
  resolveRunRoot,
  resolveAntfarmCli,
} = await import("../dist/installer/paths.js");

// ── Env cleanup helpers ──────────────────────────────────────────────

const ENV_KEYS = ["OPENCLAW_STATE_DIR", "OPENCLAW_CONFIG_PATH"];

const savedEnv: Record<string, string | undefined> = {};

// ── Tests ────────────────────────────────────────────────────────────

describe("installer/paths", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  // ── All exports return strings ──────────────────────────────────

  describe("all exported functions return strings", () => {
    it("resolveOpenClawStateDir returns a string", () => {
      assert.equal(typeof resolveOpenClawStateDir(), "string");
    });

    it("resolveOpenClawConfigPath returns a string", () => {
      assert.equal(typeof resolveOpenClawConfigPath(), "string");
    });

    it("resolveAntfarmRoot returns a string", () => {
      assert.equal(typeof resolveAntfarmRoot(), "string");
    });

    it("resolveWorkflowRoot returns a string", () => {
      assert.equal(typeof resolveWorkflowRoot(), "string");
    });

    it("resolveWorkflowDir returns a string", () => {
      assert.equal(typeof resolveWorkflowDir("test"), "string");
    });

    it("resolveWorkflowWorkspaceRoot returns a string", () => {
      assert.equal(typeof resolveWorkflowWorkspaceRoot(), "string");
    });

    it("resolveWorkflowWorkspaceDir returns a string", () => {
      assert.equal(typeof resolveWorkflowWorkspaceDir("test"), "string");
    });

    it("resolveRunRoot returns a string", () => {
      assert.equal(typeof resolveRunRoot(), "string");
    });

    it("resolveBundledWorkflowsDir returns a string", () => {
      assert.equal(typeof resolveBundledWorkflowsDir(), "string");
    });

    it("resolveBundledWorkflowDir returns a string", () => {
      assert.equal(typeof resolveBundledWorkflowDir("test"), "string");
    });

    it("resolveAntfarmCli returns a string", () => {
      assert.equal(typeof resolveAntfarmCli(), "string");
    });
  });

  // ── ID-parameterised paths include the given ID ────────────────

  describe("ID-parameterised paths include the given ID", () => {
    it("resolveWorkflowDir includes workflow ID", () => {
      const id = "agent-abc-123";
      assert.ok(
        resolveWorkflowDir(id).includes(id),
        "workflow dir should contain the workflow ID"
      );
    });

    it("resolveWorkflowWorkspaceDir includes workflow ID", () => {
      const id = "agent-xyz-789";
      assert.ok(
        resolveWorkflowWorkspaceDir(id).includes(id),
        "workspace dir should contain the workflow ID"
      );
    });

    it("resolveBundledWorkflowDir includes workflow ID", () => {
      const id = "bundled-agent-42";
      assert.ok(
        resolveBundledWorkflowDir(id).includes(id),
        "bundled workflow dir should contain the workflow ID"
      );
    });
  });

  // ── resolveOpenClawStateDir ──────────────────────────────────────

  describe("resolveOpenClawStateDir", () => {
    it("returns homedir/.openclaw by default", () => {
      const result = resolveOpenClawStateDir();
      assert.equal(result, path.join(FAKE_HOME, ".openclaw"));
    });

    it("respects OPENCLAW_STATE_DIR env var", () => {
      process.env.OPENCLAW_STATE_DIR = "/custom/state";
      const result = resolveOpenClawStateDir();
      assert.equal(result, "/custom/state");
    });

    it("trims whitespace from OPENCLAW_STATE_DIR", () => {
      process.env.OPENCLAW_STATE_DIR = "  /trimmed/path  ";
      const result = resolveOpenClawStateDir();
      assert.equal(result, "/trimmed/path");
    });

    it("ignores empty OPENCLAW_STATE_DIR", () => {
      process.env.OPENCLAW_STATE_DIR = "";
      const result = resolveOpenClawStateDir();
      assert.equal(result, path.join(FAKE_HOME, ".openclaw"));
    });

    it("ignores whitespace-only OPENCLAW_STATE_DIR", () => {
      process.env.OPENCLAW_STATE_DIR = "   ";
      const result = resolveOpenClawStateDir();
      assert.equal(result, path.join(FAKE_HOME, ".openclaw"));
    });
  });

  // ── resolveOpenClawConfigPath ────────────────────────────────────

  describe("resolveOpenClawConfigPath", () => {
    it("returns state dir + openclaw.json by default", () => {
      const result = resolveOpenClawConfigPath();
      assert.equal(
        result,
        path.join(FAKE_HOME, ".openclaw", "openclaw.json")
      );
    });

    it("respects OPENCLAW_CONFIG_PATH env var", () => {
      process.env.OPENCLAW_CONFIG_PATH = "/custom/config.json";
      const result = resolveOpenClawConfigPath();
      assert.equal(result, "/custom/config.json");
    });

    it("trims whitespace from OPENCLAW_CONFIG_PATH", () => {
      process.env.OPENCLAW_CONFIG_PATH = "  /trimmed/config.json  ";
      const result = resolveOpenClawConfigPath();
      assert.equal(result, "/trimmed/config.json");
    });

    it("ignores empty OPENCLAW_CONFIG_PATH", () => {
      process.env.OPENCLAW_CONFIG_PATH = "";
      const result = resolveOpenClawConfigPath();
      assert.equal(
        result,
        path.join(FAKE_HOME, ".openclaw", "openclaw.json")
      );
    });

    it("uses custom state dir when both env vars are unset", () => {
      process.env.OPENCLAW_STATE_DIR = "/alt/state";
      const result = resolveOpenClawConfigPath();
      assert.equal(result, path.join("/alt/state", "openclaw.json"));
    });
  });

  // ── resolveAntfarmRoot ───────────────────────────────────────────

  describe("resolveAntfarmRoot", () => {
    it("returns state dir + antfarm", () => {
      const result = resolveAntfarmRoot();
      assert.equal(result, path.join(FAKE_HOME, ".openclaw", "antfarm"));
    });

    it("respects custom state dir", () => {
      process.env.OPENCLAW_STATE_DIR = "/custom";
      const result = resolveAntfarmRoot();
      assert.equal(result, path.join("/custom", "antfarm"));
    });
  });

  // ── resolveWorkflowRoot ──────────────────────────────────────────

  describe("resolveWorkflowRoot", () => {
    it("returns antfarm root + workflows", () => {
      const result = resolveWorkflowRoot();
      assert.equal(
        result,
        path.join(FAKE_HOME, ".openclaw", "antfarm", "workflows")
      );
    });
  });

  // ── resolveWorkflowDir ───────────────────────────────────────────

  describe("resolveWorkflowDir", () => {
    it("returns workflow root + workflowId", () => {
      const result = resolveWorkflowDir("my-workflow");
      assert.equal(
        result,
        path.join(FAKE_HOME, ".openclaw", "antfarm", "workflows", "my-workflow")
      );
    });

    it("handles empty workflowId", () => {
      const result = resolveWorkflowDir("");
      assert.equal(
        result,
        path.join(FAKE_HOME, ".openclaw", "antfarm", "workflows")
      );
    });

    it("handles workflowId with special characters", () => {
      const result = resolveWorkflowDir("wf-with-dashes_and_underscores");
      assert.ok(result.endsWith("wf-with-dashes_and_underscores"));
    });
  });

  // ── resolveWorkflowWorkspaceRoot ─────────────────────────────────

  describe("resolveWorkflowWorkspaceRoot", () => {
    it("returns state dir + workspaces/workflows", () => {
      const result = resolveWorkflowWorkspaceRoot();
      assert.equal(
        result,
        path.join(FAKE_HOME, ".openclaw", "workspaces", "workflows")
      );
    });
  });

  // ── resolveWorkflowWorkspaceDir ──────────────────────────────────

  describe("resolveWorkflowWorkspaceDir", () => {
    it("returns workspace root + workflowId", () => {
      const result = resolveWorkflowWorkspaceDir("deploy-wf");
      assert.equal(
        result,
        path.join(
          FAKE_HOME,
          ".openclaw",
          "workspaces",
          "workflows",
          "deploy-wf"
        )
      );
    });

    it("handles empty workflowId", () => {
      const result = resolveWorkflowWorkspaceDir("");
      assert.equal(
        result,
        path.join(FAKE_HOME, ".openclaw", "workspaces", "workflows")
      );
    });
  });

  // ── resolveRunRoot ───────────────────────────────────────────────

  describe("resolveRunRoot", () => {
    it("returns antfarm root + runs", () => {
      const result = resolveRunRoot();
      assert.equal(
        result,
        path.join(FAKE_HOME, ".openclaw", "antfarm", "runs")
      );
    });

    it("respects custom state dir", () => {
      process.env.OPENCLAW_STATE_DIR = "/other";
      const result = resolveRunRoot();
      assert.equal(result, path.join("/other", "antfarm", "runs"));
    });
  });

  // ── resolveBundledWorkflowsDir ───────────────────────────────────

  describe("resolveBundledWorkflowsDir", () => {
    it("returns a path ending with /workflows", () => {
      const result = resolveBundledWorkflowsDir();
      assert.ok(
        result.endsWith(path.sep + "workflows") ||
          result.endsWith("/workflows"),
        `Expected path ending with /workflows, got: ${result}`
      );
    });

    it("returns an absolute path", () => {
      const result = resolveBundledWorkflowsDir();
      assert.ok(path.isAbsolute(result), `Expected absolute path, got: ${result}`);
    });
  });

  // ── resolveBundledWorkflowDir ────────────────────────────────────

  describe("resolveBundledWorkflowDir", () => {
    it("appends workflowId to bundled workflows dir", () => {
      const base = resolveBundledWorkflowsDir();
      const result = resolveBundledWorkflowDir("feature-dev");
      assert.equal(result, path.join(base, "feature-dev"));
    });

    it("handles empty workflowId", () => {
      const base = resolveBundledWorkflowsDir();
      const result = resolveBundledWorkflowDir("");
      assert.equal(result, base);
    });
  });

  // ── resolveAntfarmCli ────────────────────────────────────────────

  describe("resolveAntfarmCli", () => {
    it("returns an absolute path", () => {
      const result = resolveAntfarmCli();
      assert.ok(path.isAbsolute(result), `Expected absolute path, got: ${result}`);
    });

    it("returns a path ending with cli.js", () => {
      const result = resolveAntfarmCli();
      assert.ok(
        result.endsWith("cli.js"),
        `Expected path ending with cli.js, got: ${result}`
      );
    });

    it("path contains cli directory", () => {
      const result = resolveAntfarmCli();
      assert.ok(
        result.includes(path.join("cli", "cli.js")),
        `Expected path containing cli/cli.js, got: ${result}`
      );
    });
  });
});
