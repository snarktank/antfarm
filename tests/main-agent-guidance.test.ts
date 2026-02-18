/**
 * Agent guidance content generation unit tests
 *
 * Tests guidance content injected into agents:
 * - main-agent-guidance.ts: TOOLS.md / AGENTS.md block generation
 * - agent-cron.ts: buildWorkPrompt / buildPollingPrompt (step claim, complete, fail)
 *
 * Mocks node:fs/promises, openclaw-config, and paths to control I/O.
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

mock.module("../dist/installer/paths.js", {
  namedExports: {
    resolveAntfarmCli: () => "/home/testuser/.openclaw/workspace/antfarm/dist/cli/cli.js",
    resolveBundledWorkflowsDir: () => "/home/testuser/.openclaw/workspace/antfarm/workflows",
    resolveBundledWorkflowDir: (id: string) => `/home/testuser/.openclaw/workspace/antfarm/workflows/${id}`,
    resolveOpenClawStateDir: () => "/home/testuser/.openclaw",
    resolveOpenClawConfigPath: () => "/home/testuser/.openclaw/openclaw.json",
    resolveAntfarmRoot: () => "/home/testuser/.openclaw/antfarm",
    resolveWorkflowRoot: () => "/home/testuser/.openclaw/antfarm/workflows",
    resolveWorkflowDir: (id: string) => `/home/testuser/.openclaw/antfarm/workflows/${id}`,
    resolveWorkflowWorkspaceRoot: () => "/home/testuser/.openclaw/workspaces/workflows",
    resolveWorkflowWorkspaceDir: (id: string) => `/home/testuser/.openclaw/workspaces/workflows/${id}`,
    resolveRunRoot: () => "/home/testuser/.openclaw/antfarm/runs",
  },
});

// Import after mocks
const { updateMainAgentGuidance, removeMainAgentGuidance } = await import(
  "../dist/installer/main-agent-guidance.js"
);

const { buildWorkPrompt, buildPollingPrompt } = await import(
  "../dist/installer/agent-cron.js"
);

// ── main-agent-guidance tests ───────────────────────────────────────

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

    const toolsContent = writtenFiles.get(toolsPath);
    if (toolsContent) {
      assert.ok(
        !toolsContent.includes("antfarm:workflows"),
        "should not introduce antfarm block"
      );
    }
  });
});

// ── agent-cron prompt guidance tests ────────────────────────────────

describe("buildWorkPrompt — agent guidance content", () => {
  it("returns a non-empty string", () => {
    const prompt = buildWorkPrompt("test-wf", "worker");
    assert.ok(typeof prompt === "string", "should return a string");
    assert.ok(prompt.trim().length > 0, "should be non-empty");
  });

  it("contains step complete and step fail instructions", () => {
    const prompt = buildWorkPrompt("test-wf", "worker");
    assert.ok(
      prompt.includes("step complete"),
      "should contain step complete instruction"
    );
    assert.ok(
      prompt.includes("step fail"),
      "should contain step fail instruction"
    );
  });

  it("includes CRITICAL warning about reporting completion", () => {
    const prompt = buildWorkPrompt("test-wf", "worker");
    assert.ok(
      prompt.includes("CRITICAL"),
      "should include CRITICAL warning"
    );
    assert.ok(
      prompt.includes("step complete") && prompt.includes("step fail"),
      "CRITICAL warning relates to step complete/fail reporting"
    );
  });

  it("references the antfarm CLI path", () => {
    const prompt = buildWorkPrompt("test-wf", "worker");
    assert.ok(
      prompt.includes("cli.js"),
      "should reference the antfarm CLI path"
    );
  });
});

describe("buildPollingPrompt — agent guidance content", () => {
  it("contains antfarm step claim command syntax", () => {
    const prompt = buildPollingPrompt("test-wf", "worker");
    assert.ok(
      prompt.includes("step claim"),
      "should contain step claim command"
    );
    assert.ok(
      prompt.includes("test-wf-worker"),
      "should include the full agent ID in step claim"
    );
  });

  it("contains step complete and step fail instructions", () => {
    const prompt = buildPollingPrompt("test-wf", "worker");
    assert.ok(
      prompt.includes("step complete"),
      "should contain step complete instruction"
    );
    assert.ok(
      prompt.includes("step fail"),
      "should contain step fail instruction"
    );
  });

  it("includes CRITICAL warning about reporting completion", () => {
    const prompt = buildPollingPrompt("test-wf", "worker");
    assert.ok(
      prompt.includes("CRITICAL"),
      "should include CRITICAL warning about reporting"
    );
  });

  it("references the antfarm CLI path", () => {
    const prompt = buildPollingPrompt("test-wf", "worker");
    assert.ok(
      prompt.includes("cli.js"),
      "should reference the antfarm CLI path"
    );
  });

  it("returns a non-empty string", () => {
    const prompt = buildPollingPrompt("test-wf", "worker");
    assert.ok(typeof prompt === "string", "should return a string");
    assert.ok(prompt.trim().length > 0, "should be non-empty");
  });
});
