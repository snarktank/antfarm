/**
 * SCP-014: Validate complete workflow.yml syntax and structure
 * Tests for complete workflow validation
 */

import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_DIR = resolve(__dirname, "..", "workflows", "script-class-processor");
const WORKFLOW_FILE = resolve(WORKFLOW_DIR, "workflow.yml");

describe("workflow.yml complete validation (SCP-014)", () => {
  let yamlContent: string;
  let workflow: any;

  test("workflow.yml file exists and is readable", () => {
    yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    assert.ok(yamlContent, "workflow.yml content should not be empty");
    assert.ok(yamlContent.length > 100, "workflow.yml should have substantial content");
  });

  test("workflow.yml has valid YAML syntax", () => {
    yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    workflow = parseYaml(yamlContent);
    assert.ok(workflow, "Parsed workflow should not be null");
    assert.strictEqual(typeof workflow, "object", "Workflow should be an object");
  });

  test("workflow.yml has all required top-level fields", () => {
    yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    workflow = parseYaml(yamlContent);
    
    const requiredFields = ["id", "name", "version", "description", "polling", "agents", "steps"];
    for (const field of requiredFields) {
      assert.ok(workflow[field] !== undefined, `Workflow should have ${field} field`);
    }
  });

  test("workflow.id is a non-empty string", () => {
    yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    workflow = parseYaml(yamlContent);
    assert.strictEqual(typeof workflow.id, "string", "id should be a string");
    assert.ok(workflow.id.length > 0, "id should not be empty");
    assert.strictEqual(workflow.id, "script-class-processor", "id should match expected value");
  });

  test("workflow.name is a non-empty string", () => {
    yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    workflow = parseYaml(yamlContent);
    assert.strictEqual(typeof workflow.name, "string", "name should be a string");
    assert.ok(workflow.name.length > 0, "name should not be empty");
  });

  test("workflow.version is a number", () => {
    yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    workflow = parseYaml(yamlContent);
    assert.strictEqual(typeof workflow.version, "number", "version should be a number");
  });

  test("workflow.description is a non-empty string", () => {
    yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    workflow = parseYaml(yamlContent);
    assert.strictEqual(typeof workflow.description, "string", "description should be a string");
    assert.ok(workflow.description.length > 0, "description should not be empty");
  });

  test("workflow.polling has required fields", () => {
    yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    workflow = parseYaml(yamlContent);
    assert.ok(workflow.polling, "polling should exist");
    assert.strictEqual(typeof workflow.polling.model, "string", "polling.model should be a string");
    assert.strictEqual(typeof workflow.polling.timeoutSeconds, "number", "polling.timeoutSeconds should be a number");
  });

  test("workflow.agents is a non-empty array", () => {
    yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    workflow = parseYaml(yamlContent);
    assert.ok(Array.isArray(workflow.agents), "agents should be an array");
    assert.ok(workflow.agents.length > 0, "agents should not be empty");
  });

  test("workflow.steps is a non-empty array", () => {
    yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    workflow = parseYaml(yamlContent);
    assert.ok(Array.isArray(workflow.steps), "steps should be an array");
    assert.ok(workflow.steps.length > 0, "steps should not be empty");
  });
});

describe("workflow.yml agent reference validation (SCP-014)", () => {
  let workflow: any;

  test("setup: parse workflow.yml", () => {
    const yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    workflow = parseYaml(yamlContent);
    assert.ok(workflow, "Workflow should parse successfully");
  });

  test("all step agent references exist in agents array", () => {
    const yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    workflow = parseYaml(yamlContent);
    
    const definedAgentIds = new Set(workflow.agents.map((a: any) => a.id));
    
    for (const step of workflow.steps) {
      assert.ok(
        definedAgentIds.has(step.agent),
        `Step "${step.id}" references agent "${step.agent}" which is not defined in agents array`
      );
    }
  });

  test("all agents have required fields", () => {
    const yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    workflow = parseYaml(yamlContent);
    
    for (const agent of workflow.agents) {
      assert.ok(agent.id, `Agent should have id field`);
      assert.ok(agent.name, `Agent ${agent.id} should have name field`);
      assert.ok(agent.role, `Agent ${agent.id} should have role field`);
      assert.ok(agent.description, `Agent ${agent.id} should have description field`);
      assert.ok(agent.workspace, `Agent ${agent.id} should have workspace field`);
      assert.ok(agent.workspace.baseDir, `Agent ${agent.id} should have workspace.baseDir field`);
      assert.ok(agent.workspace.files, `Agent ${agent.id} should have workspace.files field`);
    }
  });

  test("agent ids are unique", () => {
    const yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    workflow = parseYaml(yamlContent);
    
    const ids = workflow.agents.map((a: any) => a.id);
    const uniqueIds = new Set(ids);
    assert.strictEqual(uniqueIds.size, ids.length, "All agent ids should be unique");
  });

  test("step ids are unique", () => {
    const yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    workflow = parseYaml(yamlContent);
    
    const ids = workflow.steps.map((s: any) => s.id);
    const uniqueIds = new Set(ids);
    assert.strictEqual(uniqueIds.size, ids.length, "All step ids should be unique");
  });

  test("expected agents are defined", () => {
    const yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    workflow = parseYaml(yamlContent);
    
    const expectedAgents = [
      "file-watcher",
      "transcript-cleaner",
      "chunk-analyzer",
      "jump-guide-generator",
      "notes-generator",
      "quiz-generator",
      "verification-agent"
    ];
    
    const definedAgentIds = new Set(workflow.agents.map((a: any) => a.id));
    
    for (const expectedAgent of expectedAgents) {
      assert.ok(
        definedAgentIds.has(expectedAgent),
        `Expected agent "${expectedAgent}" should be defined`
      );
    }
  });
});

describe("workflow.yml template variable validation (SCP-014)", () => {
  test("template variables are properly referenced", () => {
    const yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    const workflow = parseYaml(yamlContent);
    
    // Build map of step outputs
    const availableOutputs = new Map<string, string[]>();
    availableOutputs.set("task", ["initial"]); // task is the initial input
    
    for (const step of workflow.steps) {
      // Check inputs reference available outputs
      const inputText = step.input || "";
      const inputMatches = inputText.match(/\{\{(\w+)\}\}/g) || [];
      
      for (const match of inputMatches) {
        const varName = match.replace(/\{\{|\}\}/g, "");
        assert.ok(
          availableOutputs.has(varName),
          `Step "${step.id}" references "${varName}" which is not available from previous steps`
        );
      }
      
      // Register this step's outputs for future steps
      if (step.outputs) {
        const outputKeys = Object.keys(step.outputs);
        availableOutputs.set(step.id, outputKeys);
        
        // Also register each output as a top-level variable
        for (const key of outputKeys) {
          if (!availableOutputs.has(key)) {
            availableOutputs.set(key, [step.id]);
          }
        }
      }
    }
  });

  test("all step outputs have descriptions", () => {
    const yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    const workflow = parseYaml(yamlContent);
    
    for (const step of workflow.steps) {
      assert.ok(step.outputs, `Step "${step.id}" should have outputs`);
      const outputKeys = Object.keys(step.outputs);
      assert.ok(outputKeys.length > 0, `Step "${step.id}" should have at least one output`);
      
      for (const key of outputKeys) {
        const description = step.outputs[key];
        assert.ok(description, `Output "${key}" in step "${step.id}" should have a description`);
        assert.strictEqual(typeof description, "string", `Output "${key}" description should be a string`);
        assert.ok(description.length > 0, `Output "${key}" description should not be empty`);
      }
    }
  });

  test("template variables use correct syntax {{varname}}", () => {
    const yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    
    // All variables should use {{double}} braces
    const validTemplateMatches = yamlContent.match(/\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/g);
    assert.ok(validTemplateMatches && validTemplateMatches.length > 0, "Should have valid template variables");
  });
});

describe("workflow.yml step structure validation (SCP-014)", () => {
  test("all steps have required fields", () => {
    const yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    const workflow = parseYaml(yamlContent);
    
    for (const step of workflow.steps) {
      assert.ok(step.id, "Step should have id field");
      assert.ok(step.agent, `Step "${step.id}" should have agent field`);
      assert.ok(step.input, `Step "${step.id}" should have input field`);
      assert.ok(step.expects, `Step "${step.id}" should have expects field`);
      assert.ok(step.outputs, `Step "${step.id}" should have outputs field`);
    }
  });

  test("all steps have expects containing STATUS: done", () => {
    const yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    const workflow = parseYaml(yamlContent);
    
    for (const step of workflow.steps) {
      assert.ok(
        step.expects.includes("STATUS: done"),
        `Step "${step.id}" expects field should contain "STATUS: done"`
      );
    }
  });

  test("steps have valid on_fail configuration when present", () => {
    const yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    const workflow = parseYaml(yamlContent);
    
    for (const step of workflow.steps) {
      if (step.on_fail) {
        assert.ok(step.on_fail.escalate_to, `Step "${step.id}" on_fail should have escalate_to field`);
      }
    }
  });

  test("verify step is the last step", () => {
    const yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    const workflow = parseYaml(yamlContent);
    
    const lastStep = workflow.steps[workflow.steps.length - 1];
    assert.strictEqual(lastStep.id, "verify", "Last step should be verify");
    assert.strictEqual(lastStep.agent, "verification-agent", "Last step should use verification-agent");
  });
});

describe("workflow.yml agent workspace validation (SCP-014)", () => {
  test("all agent workspace files are properly configured", () => {
    const yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    const workflow = parseYaml(yamlContent);
    
    for (const agent of workflow.agents) {
      const { baseDir, files } = agent.workspace;
      
      // Check that baseDir follows the pattern agents/<agent-id>
      assert.ok(
        baseDir.startsWith("agents/"),
        `Agent "${agent.id}" workspace.baseDir should start with "agents/"`
      );
      
      // Check that all required files are configured
      const requiredFiles = ["AGENTS.md", "SOUL.md", "IDENTITY.md"];
      for (const requiredFile of requiredFiles) {
        assert.ok(
          files[requiredFile],
          `Agent "${agent.id}" should have ${requiredFile} configured in workspace.files`
        );
        
        // Check that the file path is correct
        const expectedPath = `${baseDir}/${requiredFile}`;
        assert.strictEqual(
          files[requiredFile],
          expectedPath,
          `Agent "${agent.id}" ${requiredFile} path should be "${expectedPath}"`
        );
      }
    }
  });
});

describe("workflow.yml complete structure summary (SCP-014)", () => {
  test("workflow has correct number of agents", () => {
    const yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    const workflow = parseYaml(yamlContent);
    
    assert.strictEqual(workflow.agents.length, 7, "Should have exactly 7 agents");
  });

  test("workflow has correct number of steps", () => {
    const yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    const workflow = parseYaml(yamlContent);
    
    assert.strictEqual(workflow.steps.length, 7, "Should have exactly 7 steps");
  });

  test("workflow follows antfarm conventions", () => {
    const yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    const workflow = parseYaml(yamlContent);
    
    // Check section ordering (id, name, version, description, polling, agents, steps)
    const contentLines = yamlContent.split("\n");
    const idLine = contentLines.findIndex(l => l.match(/^id:\s/));
    const nameLine = contentLines.findIndex(l => l.match(/^name:\s/));
    const versionLine = contentLines.findIndex(l => l.match(/^version:\s/));
    const descLine = contentLines.findIndex(l => l.match(/^description:\s/));
    const pollingLine = contentLines.findIndex(l => l.match(/^polling:\s*$/));
    const agentsLine = contentLines.findIndex(l => l.match(/^agents:\s*$/));
    const stepsLine = contentLines.findIndex(l => l.match(/^steps:\s*$/));
    
    assert.ok(idLine >= 0, "Should have id field");
    assert.ok(nameLine > idLine, "name should come after id");
    assert.ok(versionLine > nameLine, "version should come after name");
    assert.ok(descLine > versionLine, "description should come after version");
    assert.ok(pollingLine > descLine, "polling should come after description");
    assert.ok(agentsLine > pollingLine, "agents should come after polling");
    assert.ok(stepsLine > agentsLine, "steps should come after agents");
  });

  test("workflow is complete and ready for installation", () => {
    const yamlContent = readFileSync(WORKFLOW_FILE, "utf-8");
    const workflow = parseYaml(yamlContent);
    
    // Validate all required sections exist and are non-empty
    assert.ok(workflow.id, "id is required");
    assert.ok(workflow.name, "name is required");
    assert.ok(workflow.version !== undefined, "version is required");
    assert.ok(workflow.description, "description is required");
    assert.ok(workflow.polling, "polling is required");
    assert.ok(workflow.agents?.length > 0, "agents array is required and non-empty");
    assert.ok(workflow.steps?.length > 0, "steps array is required and non-empty");
    
    // Validate all agents are complete
    for (const agent of workflow.agents) {
      assert.ok(agent.id && agent.name && agent.role && agent.description, 
        `Agent is missing required fields`);
      assert.ok(agent.workspace?.baseDir && agent.workspace?.files,
        `Agent ${agent.id} workspace is incomplete`);
    }
    
    // Validate all steps are complete
    for (const step of workflow.steps) {
      assert.ok(step.id && step.agent && step.input && step.expects && step.outputs,
        `Step is missing required fields`);
    }
  });
});
