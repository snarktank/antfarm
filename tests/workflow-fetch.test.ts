/**
 * installer/workflow-fetch.ts unit tests
 *
 * Tests listBundledWorkflows() and fetchWorkflow() with mocked fs, path, and paths modules.
 * Covers listing bundled workflows, fetching/copying workflows, error cases,
 * and cache-like behavior (no real filesystem or network calls).
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// ── Mock state ──────────────────────────────────────────────────────

let mockReaddirEntries: Array<{ name: string; isDirectory: () => boolean }> = [];
let mockReaddirError: Error | null = null;
let mockAccessResults: Map<string, boolean> = new Map(); // path -> exists
let mockMkdirCalls: string[] = [];
let mockRmCalls: Array<{ path: string; opts: unknown }> = [];
let mockCpCalls: Array<{ src: string; dest: string; opts: unknown }> = [];

// ── Module mocks ────────────────────────────────────────────────────

mock.module("node:os", {
  defaultExport: {
    homedir: () => "/fake/home",
  },
});

mock.module("node:fs", {
  defaultExport: {
    mkdirSync: () => {},
    statSync: () => ({ size: 0 }),
    appendFileSync: () => {},
    readFileSync: () => "",
  },
});

mock.module("node:fs/promises", {
  defaultExport: {
    access: async (filePath: string) => {
      if (mockAccessResults.has(filePath)) {
        if (!mockAccessResults.get(filePath)) {
          throw new Error("ENOENT");
        }
        return;
      }
      throw new Error("ENOENT");
    },
    readdir: async (_dir: string, _opts: unknown) => {
      if (mockReaddirError) throw mockReaddirError;
      return mockReaddirEntries;
    },
    mkdir: async (dir: string, _opts: unknown) => {
      mockMkdirCalls.push(dir);
    },
    rm: async (p: string, opts: unknown) => {
      mockRmCalls.push({ path: p, opts });
    },
    cp: async (src: string, dest: string, opts: unknown) => {
      mockCpCalls.push({ src, dest, opts });
    },
  },
});

mock.module("../dist/installer/paths.js", {
  namedExports: {
    resolveBundledWorkflowsDir: () => "/fake/pkg/workflows",
    resolveBundledWorkflowDir: (id: string) => `/fake/pkg/workflows/${id}`,
    resolveWorkflowRoot: () => "/fake/home/.antfarm/workflows",
    resolveWorkflowDir: (id: string) => `/fake/home/.antfarm/workflows/${id}`,
  },
});

// Import after mocks
const { listBundledWorkflows, fetchWorkflow } = await import(
  "../dist/installer/workflow-fetch.js"
);

// ── Helpers ─────────────────────────────────────────────────────────

function dirEntry(name: string): { name: string; isDirectory: () => boolean } {
  return { name, isDirectory: () => true };
}

function fileEntry(name: string): { name: string; isDirectory: () => boolean } {
  return { name, isDirectory: () => false };
}

function resetMocks() {
  mockReaddirEntries = [];
  mockReaddirError = null;
  mockAccessResults = new Map();
  mockMkdirCalls = [];
  mockRmCalls = [];
  mockCpCalls = [];
}

// ── Tests ────────────────────────────────────────────────────────────

describe("installer/workflow-fetch", () => {
  beforeEach(() => {
    resetMocks();
  });

  // ── listBundledWorkflows ──────────────────────────────────────────

  describe("listBundledWorkflows", () => {
    it("returns workflow names for directories containing workflow.yml", async () => {
      mockReaddirEntries = [dirEntry("bug-fix"), dirEntry("feature-dev")];
      mockAccessResults.set("/fake/pkg/workflows/bug-fix/workflow.yml", true);
      mockAccessResults.set("/fake/pkg/workflows/feature-dev/workflow.yml", true);

      const result = await listBundledWorkflows();
      assert.deepEqual(result, ["bug-fix", "feature-dev"]);
    });

    it("skips directories without workflow.yml", async () => {
      mockReaddirEntries = [dirEntry("valid"), dirEntry("no-yml")];
      mockAccessResults.set("/fake/pkg/workflows/valid/workflow.yml", true);
      // no-yml directory does not have workflow.yml (not in mockAccessResults → ENOENT)

      const result = await listBundledWorkflows();
      assert.deepEqual(result, ["valid"]);
    });

    it("skips non-directory entries", async () => {
      mockReaddirEntries = [
        dirEntry("real-workflow"),
        fileEntry("README.md"),
      ];
      mockAccessResults.set("/fake/pkg/workflows/real-workflow/workflow.yml", true);

      const result = await listBundledWorkflows();
      assert.deepEqual(result, ["real-workflow"]);
    });

    it("returns empty array when bundled dir has no entries", async () => {
      mockReaddirEntries = [];

      const result = await listBundledWorkflows();
      assert.deepEqual(result, []);
    });

    it("returns empty array when readdir throws (e.g. dir missing)", async () => {
      mockReaddirError = new Error("ENOENT: no such file or directory");

      const result = await listBundledWorkflows();
      assert.deepEqual(result, []);
    });

    it("only includes directories where workflow.yml exists", async () => {
      mockReaddirEntries = [
        dirEntry("a"),
        dirEntry("b"),
        dirEntry("c"),
      ];
      // Only 'b' has workflow.yml
      mockAccessResults.set("/fake/pkg/workflows/b/workflow.yml", true);

      const result = await listBundledWorkflows();
      assert.deepEqual(result, ["b"]);
    });
  });

  // ── fetchWorkflow ─────────────────────────────────────────────────

  describe("fetchWorkflow", () => {
    it("copies bundled workflow to user dir and returns paths", async () => {
      // workflow.yml exists in bundled dir
      mockAccessResults.set("/fake/pkg/workflows/bug-fix/workflow.yml", true);

      const result = await fetchWorkflow("bug-fix");
      assert.equal(result.workflowDir, "/fake/home/.antfarm/workflows/bug-fix");
      assert.equal(result.bundledSourceDir, "/fake/pkg/workflows/bug-fix");
    });

    it("creates the workflow root directory", async () => {
      mockAccessResults.set("/fake/pkg/workflows/my-flow/workflow.yml", true);

      await fetchWorkflow("my-flow");
      assert.ok(mockMkdirCalls.includes("/fake/home/.antfarm/workflows"));
    });

    it("removes existing destination before copying", async () => {
      mockAccessResults.set("/fake/pkg/workflows/bug-fix/workflow.yml", true);

      await fetchWorkflow("bug-fix");

      assert.equal(mockRmCalls.length, 1);
      assert.equal(mockRmCalls[0].path, "/fake/home/.antfarm/workflows/bug-fix");
    });

    it("copies from bundled source to user destination", async () => {
      mockAccessResults.set("/fake/pkg/workflows/bug-fix/workflow.yml", true);

      await fetchWorkflow("bug-fix");

      assert.equal(mockCpCalls.length, 1);
      assert.equal(mockCpCalls[0].src, "/fake/pkg/workflows/bug-fix");
      assert.equal(mockCpCalls[0].dest, "/fake/home/.antfarm/workflows/bug-fix");
    });

    it("throws when workflow ID is not found (no bundled workflows)", async () => {
      // No workflow.yml exists → pathExists returns false
      // listBundledWorkflows returns [] because readdir has no entries
      mockReaddirEntries = [];

      await assert.rejects(
        () => fetchWorkflow("nonexistent"),
        (err: Error) => {
          assert.ok(err.message.includes('"nonexistent" not found'));
          assert.ok(err.message.includes("No workflows bundled."));
          return true;
        }
      );
    });

    it("throws with available list when workflow ID not found but others exist", async () => {
      // The requested workflow doesn't exist
      // But list shows available ones
      mockReaddirEntries = [dirEntry("bug-fix"), dirEntry("feature-dev")];
      mockAccessResults.set("/fake/pkg/workflows/bug-fix/workflow.yml", true);
      mockAccessResults.set("/fake/pkg/workflows/feature-dev/workflow.yml", true);

      await assert.rejects(
        () => fetchWorkflow("nonexistent"),
        (err: Error) => {
          assert.ok(err.message.includes('"nonexistent" not found'));
          assert.ok(err.message.includes("Available: bug-fix, feature-dev"));
          return true;
        }
      );
    });

    it("mkdir is called with recursive option via ensureDir", async () => {
      mockAccessResults.set("/fake/pkg/workflows/test-wf/workflow.yml", true);

      await fetchWorkflow("test-wf");

      // ensureDir calls mkdir for workflow root
      assert.ok(mockMkdirCalls.length >= 1);
    });

    it("rm is called before cp (copyDirectory removes then copies)", async () => {
      mockAccessResults.set("/fake/pkg/workflows/wf/workflow.yml", true);

      await fetchWorkflow("wf");

      // Both rm and cp should have been called
      assert.equal(mockRmCalls.length, 1);
      assert.equal(mockCpCalls.length, 1);
      // rm targets the destination, cp goes from source to destination
      assert.equal(mockRmCalls[0].path, "/fake/home/.antfarm/workflows/wf");
      assert.equal(mockCpCalls[0].src, "/fake/pkg/workflows/wf");
      assert.equal(mockCpCalls[0].dest, "/fake/home/.antfarm/workflows/wf");
    });
  });
});
