/**
 * workspace-files module unit tests
 *
 * Tests writeWorkflowFile() for creating, skipping, and updating workflow
 * files on disk. Mocks node:fs/promises to control file system behavior.
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// ── Mock state ──────────────────────────────────────────────────────

const mockFileContents = new Map<string, string>();
const mkdirCalls: string[] = [];
const copyFileCalls: Array<{ src: string; dest: string }> = [];

// ── Module mocks ────────────────────────────────────────────────────

mock.module("node:fs/promises", {
  defaultExport: {
    readFile: async (filePath: string, _encoding: string) => {
      const content = mockFileContents.get(filePath);
      if (content === undefined) {
        const err = new Error(
          `ENOENT: no such file or directory, open '${filePath}'`
        ) as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
      return content;
    },
    mkdir: async (dir: string, _opts?: { recursive: boolean }) => {
      mkdirCalls.push(dir);
    },
    copyFile: async (src: string, dest: string) => {
      copyFileCalls.push({ src, dest });
      // Simulate the copy by writing content
      const srcContent = mockFileContents.get(src);
      if (srcContent !== undefined) {
        mockFileContents.set(dest, srcContent);
      }
    },
  },
});

// Import after mocks
const { writeWorkflowFile } = await import(
  "../dist/installer/workspace-files.js"
);

// ── Tests ───────────────────────────────────────────────────────────

describe("writeWorkflowFile", () => {
  beforeEach(() => {
    mockFileContents.clear();
    mkdirCalls.length = 0;
    copyFileCalls.length = 0;
  });

  it("creates file when destination does not exist", async () => {
    mockFileContents.set("/src/workflow.yml", "name: test");

    const result = await writeWorkflowFile({
      destination: "/workspace/workflows/workflow.yml",
      source: "/src/workflow.yml",
      overwrite: false,
    });

    assert.equal(copyFileCalls.length, 1);
    assert.equal(copyFileCalls[0].src, "/src/workflow.yml");
    assert.equal(copyFileCalls[0].dest, "/workspace/workflows/workflow.yml");
  });

  it("returns status='created' for new files", async () => {
    mockFileContents.set("/src/workflow.yml", "name: test");

    const result = await writeWorkflowFile({
      destination: "/workspace/workflows/workflow.yml",
      source: "/src/workflow.yml",
      overwrite: false,
    });

    assert.equal(result.status, "created");
    assert.equal(result.path, "/workspace/workflows/workflow.yml");
  });

  it("returns status='skipped' when overwrite=false and file exists", async () => {
    mockFileContents.set("/workspace/workflows/workflow.yml", "existing content");
    mockFileContents.set("/src/workflow.yml", "new content");

    const result = await writeWorkflowFile({
      destination: "/workspace/workflows/workflow.yml",
      source: "/src/workflow.yml",
      overwrite: false,
    });

    assert.equal(result.status, "skipped");
    assert.equal(result.path, "/workspace/workflows/workflow.yml");
    assert.equal(copyFileCalls.length, 0, "should not copy when skipping");
  });

  it("updates file and returns status='updated' when overwrite=true and file exists", async () => {
    mockFileContents.set("/workspace/workflows/workflow.yml", "old content");
    mockFileContents.set("/src/workflow.yml", "new content");

    const result = await writeWorkflowFile({
      destination: "/workspace/workflows/workflow.yml",
      source: "/src/workflow.yml",
      overwrite: true,
    });

    assert.equal(result.status, "updated");
    assert.equal(result.path, "/workspace/workflows/workflow.yml");
    assert.equal(copyFileCalls.length, 1);
    assert.equal(copyFileCalls[0].src, "/src/workflow.yml");
  });

  it("creates parent directory if missing", async () => {
    mockFileContents.set("/src/workflow.yml", "name: test");

    await writeWorkflowFile({
      destination: "/workspace/deep/nested/dir/workflow.yml",
      source: "/src/workflow.yml",
      overwrite: false,
    });

    assert.equal(mkdirCalls.length, 1);
    assert.equal(mkdirCalls[0], "/workspace/deep/nested/dir");
  });
});
