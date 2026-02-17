/**
 * installer/workflow-spec.ts unit tests
 *
 * Tests loadWorkflowSpec() with mocked fs, path, and yaml modules.
 * Covers valid YAML parsing, missing required fields, duplicate IDs,
 * loop config validation, and polling config validation.
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// ── Mock state ──────────────────────────────────────────────────────

let fsReadFileResult: string = "";
let fsReadFileError: Error | null = null;

// ── Module mocks ────────────────────────────────────────────────────

mock.module("node:fs/promises", {
  defaultExport: {
    readFile: async (_filePath: string, _enc: string) => {
      if (fsReadFileError) throw fsReadFileError;
      return fsReadFileResult;
    },
  },
});

// Use real path.join — no need to mock path
// yaml is a real dependency — no need to mock it either

// Import after mocks
const { loadWorkflowSpec } = await import("../dist/installer/workflow-spec.js");

// ── Helpers ─────────────────────────────────────────────────────────

/** Minimal valid workflow YAML string */
const VALID_SPEC = `id: test-workflow
agents:
  - id: agent-1
    workspace:
      baseDir: /tmp/work
      files:
        README.md: content
steps:
  - id: step-1
    agent: agent-1
    input: Do something
    expects: "STATUS: done"
`;

// ── Tests ────────────────────────────────────────────────────────────

describe("installer/workflow-spec", () => {
  beforeEach(() => {
    fsReadFileResult = "";
    fsReadFileError = null;
  });

  // ── Valid specs ──────────────────────────────────────────────────

  describe("valid workflow specs", () => {
    it("parses a minimal valid YAML workflow spec", async () => {
      fsReadFileResult = VALID_SPEC;
      const spec = await loadWorkflowSpec("/fake/dir");
      assert.equal(spec.id, "test-workflow");
      assert.equal(spec.agents.length, 1);
      assert.equal(spec.agents[0].id, "agent-1");
      assert.equal(spec.steps.length, 1);
      assert.equal(spec.steps[0].id, "step-1");
    });

    it("parses a spec with multiple agents and steps", async () => {
      fsReadFileResult = `id: test-workflow
agents:
  - id: agent-1
    workspace:
      baseDir: /tmp/a
      files:
        a.md: a
  - id: agent-2
    workspace:
      baseDir: /tmp/b
      files:
        b.md: b
steps:
  - id: step-1
    agent: agent-1
    input: Do A
    expects: "STATUS: done"
  - id: step-2
    agent: agent-2
    input: Do B
    expects: "STATUS: done"`;
      const spec = await loadWorkflowSpec("/fake/dir");
      assert.equal(spec.agents.length, 2);
      assert.equal(spec.steps.length, 2);
      assert.equal(spec.agents[1].id, "agent-2");
      assert.equal(spec.steps[1].id, "step-2");
    });

    it("parses a spec with polling config", async () => {
      fsReadFileResult = `id: test-workflow
polling:
  model: sonnet
  timeoutSeconds: 300
agents:
  - id: agent-1
    workspace:
      baseDir: /tmp/work
      files:
        README.md: content
steps:
  - id: step-1
    agent: agent-1
    input: Do something
    expects: "STATUS: done"`;
      const spec = await loadWorkflowSpec("/fake/dir");
      assert.deepEqual(spec.polling, { model: "sonnet", timeoutSeconds: 300 });
    });

    it("parses a spec with agent optional fields", async () => {
      fsReadFileResult = `id: test-workflow
agents:
  - id: agent-1
    name: Test Agent
    description: A test
    role: coding
    model: opus
    timeoutSeconds: 600
    workspace:
      baseDir: /tmp/work
      files:
        README.md: content
      skills:
        - skill-a
steps:
  - id: step-1
    agent: agent-1
    input: Do something
    expects: "STATUS: done"`;
      const spec = await loadWorkflowSpec("/fake/dir");
      assert.equal(spec.agents[0].name, "Test Agent");
      assert.equal(spec.agents[0].timeoutSeconds, 600);
    });

    it("parses a spec with loop step", async () => {
      fsReadFileResult = `id: test-workflow
agents:
  - id: agent-1
    workspace:
      baseDir: /tmp/work
      files:
        README.md: content
steps:
  - id: step-1
    agent: agent-1
    input: Do A
    expects: "STATUS: done"
    type: loop
    loop:
      over: stories
      completion: all_done
      fresh_session: true`;
      const spec = await loadWorkflowSpec("/fake/dir");
      assert.equal(spec.steps[0].type, "loop");
      assert.ok(spec.steps[0].loop);
      assert.equal(spec.steps[0].loop!.over, "stories");
      assert.equal(spec.steps[0].loop!.completion, "all_done");
      assert.equal(spec.steps[0].loop!.freshSession, true);
    });
  });

  // ── File I/O errors ─────────────────────────────────────────────

  describe("file I/O errors", () => {
    it("throws when file cannot be read", async () => {
      fsReadFileError = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      await assert.rejects(
        () => loadWorkflowSpec("/missing/dir"),
        { message: "ENOENT" },
      );
    });
  });

  // ── Missing required fields ─────────────────────────────────────

  describe("missing required fields", () => {
    it("throws when id is missing", async () => {
      fsReadFileResult = `agents:
  - id: agent-1
    workspace:
      baseDir: /tmp/work
      files:
        README.md: content
steps:
  - id: step-1
    agent: agent-1
    input: Do something
    expects: "STATUS: done"`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("missing id"));
          return true;
        },
      );
    });

    it("throws when agents list is missing", async () => {
      fsReadFileResult = `id: test-workflow\nsteps:\n  - id: step-1\n    agent: agent-1\n    input: Do something\n    expects: "STATUS: done"`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("missing agents"));
          return true;
        },
      );
    });

    it("throws when agents list is empty", async () => {
      fsReadFileResult = `id: test-workflow\nagents: []\nsteps:\n  - id: step-1\n    agent: agent-1\n    input: Do something\n    expects: "STATUS: done"`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("missing agents"));
          return true;
        },
      );
    });

    it("throws when steps list is missing", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/work\n      files:\n        README.md: content`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("missing steps"));
          return true;
        },
      );
    });

    it("throws when steps list is empty", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/work\n      files:\n        README.md: content\nsteps: []`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("missing steps"));
          return true;
        },
      );
    });

    it("throws when agent id is missing", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - workspace:\n      baseDir: /tmp/work\n      files:\n        README.md: content\nsteps:\n  - id: step-1\n    agent: agent-1\n    input: Do something\n    expects: "STATUS: done"`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("missing agent id"));
          return true;
        },
      );
    });

    it("throws when agent workspace.baseDir is missing", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - id: agent-1\n    workspace:\n      files:\n        README.md: content\nsteps:\n  - id: step-1\n    agent: agent-1\n    input: Do something\n    expects: "STATUS: done"`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("missing workspace.baseDir"));
          return true;
        },
      );
    });

    it("throws when agent workspace.files is missing", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/work\nsteps:\n  - id: step-1\n    agent: agent-1\n    input: Do something\n    expects: "STATUS: done"`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("missing workspace.files"));
          return true;
        },
      );
    });

    it("throws when step id is missing", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/work\n      files:\n        README.md: content\nsteps:\n  - agent: agent-1\n    input: Do something\n    expects: "STATUS: done"`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("missing step id"));
          return true;
        },
      );
    });

    it("throws when step agent is missing", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/work\n      files:\n        README.md: content\nsteps:\n  - id: step-1\n    input: Do something\n    expects: "STATUS: done"`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("missing step.agent"));
          return true;
        },
      );
    });

    it("throws when step input is missing", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/work\n      files:\n        README.md: content\nsteps:\n  - id: step-1\n    agent: agent-1\n    expects: "STATUS: done"`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("missing step.input"));
          return true;
        },
      );
    });

    it("throws when step expects is missing", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/work\n      files:\n        README.md: content\nsteps:\n  - id: step-1\n    agent: agent-1\n    input: Do something`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("missing step.expects"));
          return true;
        },
      );
    });
  });

  // ── Duplicate IDs ───────────────────────────────────────────────

  describe("duplicate IDs", () => {
    it("throws on duplicate agent IDs", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/a\n      files:\n        a.md: a\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/b\n      files:\n        b.md: b\nsteps:\n  - id: step-1\n    agent: agent-1\n    input: Do something\n    expects: "STATUS: done"`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes('duplicate agent id "agent-1"'));
          return true;
        },
      );
    });

    it("throws on duplicate step IDs", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/work\n      files:\n        README.md: content\nsteps:\n  - id: step-1\n    agent: agent-1\n    input: Do A\n    expects: "STATUS: done"\n  - id: step-1\n    agent: agent-1\n    input: Do B\n    expects: "STATUS: done"`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes('duplicate step id "step-1"'));
          return true;
        },
      );
    });
  });

  // ── Polling config validation ───────────────────────────────────

  describe("polling config validation", () => {
    it("throws when polling.timeoutSeconds is zero", async () => {
      fsReadFileResult = `id: test-workflow\npolling:\n  timeoutSeconds: 0\nagents:\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/work\n      files:\n        README.md: content\nsteps:\n  - id: step-1\n    agent: agent-1\n    input: Do something\n    expects: "STATUS: done"`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("polling.timeoutSeconds must be positive"));
          return true;
        },
      );
    });

    it("throws when polling.timeoutSeconds is negative", async () => {
      fsReadFileResult = `id: test-workflow\npolling:\n  timeoutSeconds: -5\nagents:\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/work\n      files:\n        README.md: content\nsteps:\n  - id: step-1\n    agent: agent-1\n    input: Do something\n    expects: "STATUS: done"`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("polling.timeoutSeconds must be positive"));
          return true;
        },
      );
    });
  });

  // ── Agent validation edge cases ─────────────────────────────────

  describe("agent validation edge cases", () => {
    it("throws when agent timeoutSeconds is zero", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - id: agent-1\n    timeoutSeconds: 0\n    workspace:\n      baseDir: /tmp/work\n      files:\n        README.md: content\nsteps:\n  - id: step-1\n    agent: agent-1\n    input: Do something\n    expects: "STATUS: done"`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("timeoutSeconds must be positive"));
          return true;
        },
      );
    });

    it("throws when workspace.skills is not a list", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/work\n      files:\n        README.md: content\n      skills: not-a-list\nsteps:\n  - id: step-1\n    agent: agent-1\n    input: Do something\n    expects: "STATUS: done"`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("workspace.skills must be a list"));
          return true;
        },
      );
    });

    it("throws when workspace.files is empty object", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/work\n      files: {}\nsteps:\n  - id: step-1\n    agent: agent-1\n    input: Do something\n    expects: "STATUS: done"`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("missing workspace.files"));
          return true;
        },
      );
    });
  });

  // ── Loop config validation ──────────────────────────────────────

  describe("loop config validation", () => {
    it("throws when step has type=loop but no loop config", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/work\n      files:\n        README.md: content\nsteps:\n  - id: step-1\n    agent: agent-1\n    input: Do something\n    expects: "STATUS: done"\n    type: loop`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("has type=loop but no loop config"));
          return true;
        },
      );
    });

    it("throws when loop.over is not stories", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/work\n      files:\n        README.md: content\nsteps:\n  - id: step-1\n    agent: agent-1\n    input: Do something\n    expects: "STATUS: done"\n    type: loop\n    loop:\n      over: tasks\n      completion: all_done`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes('loop.over must be "stories"'));
          return true;
        },
      );
    });

    it("throws when loop.completion is not all_done", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/work\n      files:\n        README.md: content\nsteps:\n  - id: step-1\n    agent: agent-1\n    input: Do something\n    expects: "STATUS: done"\n    type: loop\n    loop:\n      over: stories\n      completion: any_done`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes('loop.completion must be "all_done"'));
          return true;
        },
      );
    });

    it("throws when loop.verify_step references unknown step", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/work\n      files:\n        README.md: content\nsteps:\n  - id: step-1\n    agent: agent-1\n    input: Do something\n    expects: "STATUS: done"\n    type: loop\n    loop:\n      over: stories\n      completion: all_done\n      verify_each: true\n      verify_step: nonexistent-step`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("loop.verify_step references unknown step"));
          return true;
        },
      );
    });

    it("accepts valid loop with verify_step referencing existing step", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/work\n      files:\n        README.md: content\nsteps:\n  - id: verify-step\n    agent: agent-1\n    input: Verify\n    expects: "STATUS: done"\n  - id: step-1\n    agent: agent-1\n    input: Do something\n    expects: "STATUS: done"\n    type: loop\n    loop:\n      over: stories\n      completion: all_done\n      verify_each: true\n      verify_step: verify-step`;
      const spec = await loadWorkflowSpec("/fake/dir");
      assert.equal(spec.steps.length, 2);
      assert.equal(spec.steps[1].loop!.verifyStep, "verify-step");
      assert.equal(spec.steps[1].loop!.verifyEach, true);
    });

    it("parses loop config with snake_case fresh_session", async () => {
      fsReadFileResult = `id: test-workflow\nagents:\n  - id: agent-1\n    workspace:\n      baseDir: /tmp/work\n      files:\n        README.md: content\nsteps:\n  - id: step-1\n    agent: agent-1\n    input: Do something\n    expects: "STATUS: done"\n    type: loop\n    loop:\n      over: stories\n      completion: all_done\n      fresh_session: true`;
      const spec = await loadWorkflowSpec("/fake/dir");
      assert.equal(spec.steps[0].loop!.freshSession, true);
    });
  });

  // ── Malformed YAML ──────────────────────────────────────────────

  describe("malformed input", () => {
    it("throws on invalid YAML syntax", async () => {
      fsReadFileResult = `id: test\n  invalid: [unclosed`;
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
      );
    });

    it("throws when YAML parses to null (empty file)", async () => {
      fsReadFileResult = "";
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("missing id"));
          return true;
        },
      );
    });

    it("throws when YAML parses to a string instead of object", async () => {
      fsReadFileResult = "just a plain string";
      await assert.rejects(
        () => loadWorkflowSpec("/fake/dir"),
        (err: Error) => {
          assert.ok(err.message.includes("missing id") || err.message.includes("missing agents"));
          return true;
        },
      );
    });
  });
});
