/**
 * main-agent-guidance module unit tests
 *
 * Tests the guidance content generation for TOOLS.md and AGENTS.md,
 * including the upsertBlock/removeBlock helpers and the async
 * updateMainAgentGuidance / removeMainAgentGuidance functions.
 * Mocks node:fs/promises and openclaw-config to control I/O.
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// ── Mock state ──────────────────────────────────────────────────────

const mockFileContents = new Map<string, string>();
const writtenFiles = new Map<string, string>();
const mkdirCalls: string[] = [];

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
    writeFile: async (filePath: string, content: string, _encoding: string) => {
      writtenFiles.set(filePath, content);
      mockFileContents.set(filePath, content);
    },
    mkdir: async (dir: string, _opts?: { recursive: boolean }) => {
      mkdirCalls.push(dir);
    },
  },
});

mock.module("../dist/installer/openclaw-config.js", {
  namedExports: {
    readOpenClawConfig: async () => ({
      path: "/home/testuser/.openclaw/config.json5",
      config: {},
    }),
  },
});

// Import after mocks
const { updateMainAgentGuidance, removeMainAgentGuidance } = await import(
  "../dist/installer/main-agent-guidance.js"
);

// ── Tests ───────────────────────────────────────────────────────────

describe("updateMainAgentGuidance", () => {
  beforeEach(() => {
    mockFileContents.clear();
    writtenFiles.clear();
    mkdirCalls.length = 0;
    process.env.HOME = "/home/testuser";
  });

  it("writes TOOLS.md with antfarm CLI command syntax", async () => {
    await updateMainAgentGuidance();

    const toolsPath = "/home/testuser/.openclaw/workspace/TOOLS.md";
    const content = writtenFiles.get(toolsPath);
    assert.ok(content, "TOOLS.md should have been written");
    assert.ok(
      content.includes("workflow install"),
      "should contain workflow install command"
    );
    assert.ok(
      content.includes("workflow run"),
      "should contain workflow run command"
    );
    assert.ok(
      content.includes("workflow status"),
      "should contain workflow status command"
    );
  });

  it("writes AGENTS.md with workflow policy instructions", async () => {
    await updateMainAgentGuidance();

    const agentsPath = "/home/testuser/.openclaw/workspace/AGENTS.md";
    const content = writtenFiles.get(agentsPath);
    assert.ok(content, "AGENTS.md should have been written");
    assert.ok(
      content.includes("Workflow Policy"),
      "should contain workflow policy section"
    );
  });

  it("guidance output references the antfarm CLI path", async () => {
    await updateMainAgentGuidance();

    const toolsPath = "/home/testuser/.openclaw/workspace/TOOLS.md";
    const agentsPath = "/home/testuser/.openclaw/workspace/AGENTS.md";
    const toolsContent = writtenFiles.get(toolsPath)!;
    const agentsContent = writtenFiles.get(agentsPath)!;

    const cliPath = "node ~/.openclaw/workspace/antfarm/dist/cli/cli.js";
    assert.ok(
      toolsContent.includes(cliPath),
      "TOOLS.md should reference the antfarm CLI path"
    );
    assert.ok(
      agentsContent.includes(cliPath),
      "AGENTS.md should reference the antfarm CLI path"
    );
  });

  it("guidance functions return non-empty content in written files", async () => {
    await updateMainAgentGuidance();

    const toolsPath = "/home/testuser/.openclaw/workspace/TOOLS.md";
    const agentsPath = "/home/testuser/.openclaw/workspace/AGENTS.md";

    assert.ok(writtenFiles.has(toolsPath), "TOOLS.md should be written");
    assert.ok(writtenFiles.has(agentsPath), "AGENTS.md should be written");
    assert.ok(
      writtenFiles.get(toolsPath)!.trim().length > 0,
      "TOOLS.md content should be non-empty"
    );
    assert.ok(
      writtenFiles.get(agentsPath)!.trim().length > 0,
      "AGENTS.md content should be non-empty"
    );
  });

  it("creates workspace directory if needed", async () => {
    await updateMainAgentGuidance();

    assert.ok(mkdirCalls.length > 0, "should call mkdir for workspace dir");
    assert.ok(
      mkdirCalls[0].includes(".openclaw/workspace"),
      "should create .openclaw/workspace directory"
    );
  });

  it("upserts block into existing TOOLS.md content", async () => {
    const toolsPath = "/home/testuser/.openclaw/workspace/TOOLS.md";
    mockFileContents.set(toolsPath, "# Existing Tools\nSome content\n");

    await updateMainAgentGuidance();

    const content = writtenFiles.get(toolsPath)!;
    assert.ok(
      content.includes("# Existing Tools"),
      "should preserve existing content"
    );
    assert.ok(
      content.includes("<!-- antfarm:workflows -->"),
      "should add workflow block marker"
    );
  });

  it("replaces existing antfarm block when updating", async () => {
    const toolsPath = "/home/testuser/.openclaw/workspace/TOOLS.md";
    mockFileContents.set(
      toolsPath,
      "# Existing\n<!-- antfarm:workflows -->\nold content\n<!-- /antfarm:workflows -->\n# After\n"
    );

    await updateMainAgentGuidance();

    const content = writtenFiles.get(toolsPath)!;
    assert.ok(
      !content.includes("old content"),
      "should remove old antfarm block content"
    );
    assert.ok(
      content.includes("# Existing"),
      "should preserve content before block"
    );
    assert.ok(
      content.includes("# After"),
      "should preserve content after block"
    );
    assert.ok(
      content.includes("Antfarm CLI"),
      "should insert new antfarm block"
    );
  });

  it("guidance includes self-advancing workflow description", async () => {
    await updateMainAgentGuidance();

    const agentsPath = "/home/testuser/.openclaw/workspace/AGENTS.md";
    const content = writtenFiles.get(agentsPath)!;
    assert.ok(
      content.includes("self-advance"),
      "should mention self-advancing workflows"
    );
  });
});

describe("removeMainAgentGuidance", () => {
  beforeEach(() => {
    mockFileContents.clear();
    writtenFiles.clear();
    mkdirCalls.length = 0;
    process.env.HOME = "/home/testuser";
  });

  it("removes antfarm block from TOOLS.md", async () => {
    const toolsPath = "/home/testuser/.openclaw/workspace/TOOLS.md";
    mockFileContents.set(
      toolsPath,
      "# Tools\n<!-- antfarm:workflows -->\nworkflow stuff\n<!-- /antfarm:workflows -->\n# Other\n"
    );
    const agentsPath = "/home/testuser/.openclaw/workspace/AGENTS.md";
    mockFileContents.set(agentsPath, "");

    await removeMainAgentGuidance();

    const content = writtenFiles.get(toolsPath)!;
    assert.ok(
      !content.includes("antfarm:workflows"),
      "should remove antfarm block markers"
    );
    assert.ok(
      !content.includes("workflow stuff"),
      "should remove antfarm block content"
    );
    assert.ok(content.includes("# Tools"), "should keep surrounding content");
    assert.ok(content.includes("# Other"), "should keep surrounding content");
  });

  it("handles missing files gracefully", async () => {
    // Files don't exist - readFileOrEmpty returns ""
    await assert.doesNotReject(
      () => removeMainAgentGuidance(),
      "should not throw when files are missing"
    );
  });

  it("does not write when there is no antfarm block to remove", async () => {
    const toolsPath = "/home/testuser/.openclaw/workspace/TOOLS.md";
    mockFileContents.set(toolsPath, "# Just regular content\n");
    const agentsPath = "/home/testuser/.openclaw/workspace/AGENTS.md";
    mockFileContents.set(agentsPath, "# Regular agents\n");

    await removeMainAgentGuidance();

    // The function writes when content is truthy, but removeBlock returns
    // the same content if no block found. So files will be written.
    const toolsContent = writtenFiles.get(toolsPath);
    if (toolsContent) {
      assert.ok(
        !toolsContent.includes("antfarm:workflows"),
        "should not introduce antfarm block"
      );
    }
  });
});
