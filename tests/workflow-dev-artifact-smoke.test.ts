import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import YAML from "yaml";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";
import { resolveTemplate } from "../dist/installer/step-ops.js";

type SmokeFixture = {
  task: string;
  repo: string;
  branch: string;
  build_cmd: string;
  test_cmd: string;
  changes: string;
  current_story: string;
};

describe("workflow-dev generated artifact smoke", () => {
  it("validates workflow artifact structure and step-agent references from fixture-driven generation path", async () => {
    const workflowDir = path.resolve("workflows/workflow-dev");
    const repoRoot = path.resolve(workflowDir, "..", "..");
    const fixturePath = path.resolve("tests/fixtures/workflow-dev-smoke-task.json");
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as SmokeFixture;

    const spec = await loadWorkflowSpec(workflowDir);
    const implementStep = spec.steps.find((step) => step.id === "implement");
    const verifyStep = spec.steps.find((step) => step.id === "verify");

    assert.ok(implementStep?.input, "implement step input should exist");
    assert.ok(verifyStep?.input, "verify step input should exist");

    const implementInput = resolveTemplate(implementStep!.input, fixture);
    const verifyInput = resolveTemplate(verifyStep!.input, fixture);

    assert.ok(implementInput.includes(fixture.task));
    assert.ok(implementInput.includes(fixture.current_story));
    assert.ok(implementInput.includes("Generate or update `workflow.yml`"));
    assert.ok(implementInput.includes("`AGENTS.md`, `SOUL.md`, and `IDENTITY.md`"));

    assert.ok(verifyInput.includes(fixture.task));
    assert.ok(verifyInput.includes(fixture.changes));
    assert.ok(verifyInput.includes("Generated `workflow.yml` parses as valid YAML"));
    assert.ok(verifyInput.includes("references a declared agent id"));

    const workflowYamlPath = path.join(workflowDir, "workflow.yml");
    const parsed = YAML.parse(readFileSync(workflowYamlPath, "utf8")) as {
      id?: string;
      name?: string;
      version?: number;
      description?: string;
      agents?: Array<{ id?: string; workspace?: { files?: Record<string, string> } }>;
      steps?: Array<{ id?: string; agent?: string; input?: string }>;
    };

    assert.equal(parsed.id, "workflow-dev");
    assert.ok(parsed.name, "workflow name is required");
    assert.equal(typeof parsed.version, "number");
    assert.ok(parsed.description, "workflow description is required");
    assert.ok(Array.isArray(parsed.agents) && parsed.agents.length > 0, "agents are required");
    assert.ok(Array.isArray(parsed.steps) && parsed.steps.length > 0, "steps are required");

    const agentIds = new Set((parsed.agents ?? []).map((agent) => agent.id).filter(Boolean));
    for (const step of parsed.steps ?? []) {
      assert.ok(step.id, "step.id is required");
      assert.ok(step.agent, "step.agent is required");
      assert.ok(step.input, `step ${step.id} input is required`);
      assert.ok(agentIds.has(step.agent), `step ${step.id} references undeclared agent ${step.agent}`);
    }

    for (const agent of parsed.agents ?? []) {
      const files = agent.workspace?.files ?? {};
      for (const required of ["AGENTS.md", "SOUL.md", "IDENTITY.md"]) {
        assert.ok(files[required], `agent ${agent.id} missing ${required} mapping`);
        const resolved = path.resolve(workflowDir, files[required]);
        const inWorkflowDir = resolved.startsWith(workflowDir);
        const inRepo = resolved.startsWith(repoRoot);
        assert.ok(inWorkflowDir || inRepo, `agent ${agent.id} ${required} path escapes repo`);
        assert.ok(existsSync(resolved), `agent ${agent.id} missing file on disk: ${files[required]}`);
      }
    }
  });
});
