import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { validateWorkflowYaml, type ValidationResult } from "../dist/installer/workflow-validation.js";

describe("Workflow Validation", () => {
  describe("validateWorkflowYaml", () => {
    describe("YAML syntax validation", () => {
      it("should reject invalid YAML syntax", () => {
        const invalidYaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files:
        file1.txt: content
steps:
  - id: step1
    agent: dev
    input: Do something
    expects: Success
  - id: step2  # Missing closing bracket for this list item
    agent: dev
    input: [unclosed bracket
    expects: Success
`;
        const result = validateWorkflowYaml(invalidYaml);
        
        assert.equal(result.valid, false);
        assert.equal(result.errors.length, 1);
        assert.equal(result.errors[0].code, "YAML_SYNTAX_ERROR");
        assert.match(result.errors[0].message, /Invalid YAML syntax/);
      });

      it("should reject non-object YAML", () => {
        const result = validateWorkflowYaml("just a string");
        
        assert.equal(result.valid, false);
        assert.equal(result.errors.length, 1);
        assert.equal(result.errors[0].code, "INVALID_STRUCTURE");
        assert.equal(result.errors[0].message, "Workflow YAML must be an object");
      });

      it("should reject null YAML", () => {
        const result = validateWorkflowYaml("null");
        
        assert.equal(result.valid, false);
        assert.equal(result.errors.length, 1);
        assert.equal(result.errors[0].code, "INVALID_STRUCTURE");
      });
    });

    describe("Required fields validation", () => {
      it("should reject workflow missing id", () => {
        const yaml = `
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files:
        file1.txt: content
steps:
  - id: step1
    agent: dev
    input: Do something
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const idError = result.errors.find(e => e.field === "id");
        assert.ok(idError);
        assert.equal(idError.code, "MISSING_REQUIRED_FIELD");
      });

      it("should reject workflow missing name", () => {
        const yaml = `
id: test-workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files:
        file1.txt: content
steps:
  - id: step1
    agent: dev
    input: Do something
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const nameError = result.errors.find(e => e.field === "name");
        assert.ok(nameError);
        assert.equal(nameError.code, "MISSING_REQUIRED_FIELD");
      });

      it("should reject workflow missing agents", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
steps:
  - id: step1
    agent: dev
    input: Do something
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const agentsError = result.errors.find(e => e.field === "agents");
        assert.ok(agentsError);
        assert.equal(agentsError.code, "MISSING_REQUIRED_FIELD");
      });

      it("should reject workflow missing steps", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files:
        file1.txt: content
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const stepsError = result.errors.find(e => e.field === "steps");
        assert.ok(stepsError);
        assert.equal(stepsError.code, "MISSING_REQUIRED_FIELD");
      });
    });

    describe("ID validation", () => {
      it("should reject empty id", () => {
        const yaml = `
id: ""
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files:
        file1.txt: content
steps:
  - id: step1
    agent: dev
    input: Do something
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const idError = result.errors.find(e => e.field === "id");
        assert.ok(idError);
        assert.equal(idError.code, "INVALID_ID");
      });

      it("should reject id with underscores", () => {
        const yaml = `
id: test_workflow
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files:
        file1.txt: content
steps:
  - id: step1
    agent: dev
    input: Do something
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const idError = result.errors.find(e => e.field === "id");
        assert.ok(idError);
        assert.equal(idError.code, "INVALID_ID_FORMAT");
        assert.match(idError.message, /must not contain underscores/);
      });
    });

    describe("Agent validation", () => {
      it("should reject empty agents array", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents: []
steps:
  - id: step1
    agent: dev
    input: Do something
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const agentsError = result.errors.find(e => e.field === "agents");
        assert.ok(agentsError);
        assert.equal(agentsError.code, "INVALID_AGENTS");
      });

      it("should reject agent without id", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - workspace:
      baseDir: /test
      files:
        file1.txt: content
steps:
  - id: step1
    agent: dev
    input: Do something
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const agentIdError = result.errors.find(e => e.field === "agents[0].id");
        assert.ok(agentIdError);
        assert.equal(agentIdError.code, "INVALID_AGENT_ID");
      });

      it("should reject agent with underscore in id", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev_agent
    workspace:
      baseDir: /test
      files:
        file1.txt: content
steps:
  - id: step1
    agent: dev_agent
    input: Do something
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const agentIdError = result.errors.find(e => e.field === "agents[0].id");
        assert.ok(agentIdError);
        assert.equal(agentIdError.code, "INVALID_AGENT_ID_FORMAT");
        assert.match(agentIdError.message, /must not contain underscores/);
      });

      it("should reject duplicate agent ids", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test1
      files:
        file1.txt: content
  - id: dev
    workspace:
      baseDir: /test2
      files:
        file2.txt: content
steps:
  - id: step1
    agent: dev
    input: Do something
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const duplicateError = result.errors.find(e => e.code === "DUPLICATE_AGENT_ID");
        assert.ok(duplicateError);
        assert.match(duplicateError.message, /Duplicate agent id: "dev"/);
      });

      it("should reject agent without workspace", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
steps:
  - id: step1
    agent: dev
    input: Do something
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const workspaceError = result.errors.find(e => e.field === "agents[0].workspace");
        assert.ok(workspaceError);
        assert.equal(workspaceError.code, "MISSING_WORKSPACE");
      });

      it("should reject agent without baseDir", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
    workspace:
      files:
        file1.txt: content
steps:
  - id: step1
    agent: dev
    input: Do something
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const baseDirError = result.errors.find(e => e.field === "agents[0].workspace.baseDir");
        assert.ok(baseDirError);
        assert.equal(baseDirError.code, "INVALID_BASE_DIR");
      });

      it("should reject agent without files", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files: {}
steps:
  - id: step1
    agent: dev
    input: Do something
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const filesError = result.errors.find(e => e.field === "agents[0].workspace.files");
        assert.ok(filesError);
        assert.equal(filesError.code, "INVALID_WORKSPACE_FILES");
      });

      it("should reject invalid skills format", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files:
        file1.txt: content
      skills: "not an array"
steps:
  - id: step1
    agent: dev
    input: Do something
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const skillsError = result.errors.find(e => e.field === "agents[0].workspace.skills");
        assert.ok(skillsError);
        assert.equal(skillsError.code, "INVALID_SKILLS");
      });

      it("should reject invalid timeout", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
    timeoutSeconds: -10
    workspace:
      baseDir: /test
      files:
        file1.txt: content
steps:
  - id: step1
    agent: dev
    input: Do something
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const timeoutError = result.errors.find(e => e.field === "agents[0].timeoutSeconds");
        assert.ok(timeoutError);
        assert.equal(timeoutError.code, "INVALID_TIMEOUT");
      });
    });

    describe("Step validation", () => {
      it("should reject empty steps array", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files:
        file1.txt: content
steps: []
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const stepsError = result.errors.find(e => e.field === "steps");
        assert.ok(stepsError);
        assert.equal(stepsError.code, "INVALID_STEPS");
      });

      it("should reject step without id", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files:
        file1.txt: content
steps:
  - agent: dev
    input: Do something
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const stepIdError = result.errors.find(e => e.field === "steps[0].id");
        assert.ok(stepIdError);
        assert.equal(stepIdError.code, "INVALID_STEP_ID");
      });

      it("should reject duplicate step ids", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files:
        file1.txt: content
steps:
  - id: step1
    agent: dev
    input: Do something
    expects: Success
  - id: step1
    agent: dev
    input: Do something else
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const duplicateError = result.errors.find(e => e.code === "DUPLICATE_STEP_ID");
        assert.ok(duplicateError);
        assert.match(duplicateError.message, /Duplicate step id: "step1"/);
      });
    });

    describe("Agent reference validation", () => {
      it("should reject step referencing unknown agent", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files:
        file1.txt: content
steps:
  - id: step1
    agent: unknown-agent
    input: Do something
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const agentRefError = result.errors.find(e => e.code === "UNKNOWN_AGENT_REFERENCE");
        assert.ok(agentRefError);
        assert.match(agentRefError.message, /references unknown agent: "unknown-agent"/);
      });

      it("should reject step without agent reference", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files:
        file1.txt: content
steps:
  - id: step1
    input: Do something
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const agentError = result.errors.find(e => e.field === "steps[0].agent");
        assert.ok(agentError);
        assert.equal(agentError.code, "INVALID_STEP_AGENT");
      });
    });

    describe("Step field validation", () => {
      it("should reject step without input", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files:
        file1.txt: content
steps:
  - id: step1
    agent: dev
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const inputError = result.errors.find(e => e.field === "steps[0].input");
        assert.ok(inputError);
        assert.equal(inputError.code, "INVALID_STEP_INPUT");
      });

      it("should reject step without expects", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files:
        file1.txt: content
steps:
  - id: step1
    agent: dev
    input: Do something
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const expectsError = result.errors.find(e => e.field === "steps[0].expects");
        assert.ok(expectsError);
        assert.equal(expectsError.code, "INVALID_STEP_EXPECTS");
      });
    });

    describe("Loop validation", () => {
      it("should reject loop step without loop config", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files:
        file1.txt: content
steps:
  - id: step1
    agent: dev
    type: loop
    input: Process stories
    expects: All done
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const loopError = result.errors.find(e => e.code === "MISSING_LOOP_CONFIG");
        assert.ok(loopError);
      });

      it("should reject invalid loop.over value", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files:
        file1.txt: content
steps:
  - id: step1
    agent: dev
    type: loop
    loop:
      over: tasks
      completion: all_done
    input: Process stories
    expects: All done
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const loopOverError = result.errors.find(e => e.code === "INVALID_LOOP_OVER");
        assert.ok(loopOverError);
      });

      it("should reject invalid loop.completion value", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files:
        file1.txt: content
steps:
  - id: step1
    agent: dev
    type: loop
    loop:
      over: stories
      completion: some_done
    input: Process stories
    expects: All done
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const loopCompletionError = result.errors.find(e => e.code === "INVALID_LOOP_COMPLETION");
        assert.ok(loopCompletionError);
      });

      it("should reject unknown verifyStep reference", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files:
        file1.txt: content
steps:
  - id: step1
    agent: dev
    type: loop
    loop:
      over: stories
      completion: all_done
      verifyEach: true
      verifyStep: unknown-step
    input: Process stories
    expects: All done
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        const verifyStepError = result.errors.find(e => e.code === "UNKNOWN_STEP_REFERENCE");
        assert.ok(verifyStepError);
        assert.match(verifyStepError.message, /references unknown step: "unknown-step"/);
      });
    });

    describe("Valid workflow", () => {
      it("should accept valid minimal workflow", () => {
        const yaml = `
id: test-workflow
name: Test Workflow
agents:
  - id: dev
    workspace:
      baseDir: /test
      files:
        file1.txt: content
steps:
  - id: step1
    agent: dev
    input: Do something
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, true);
        assert.equal(result.errors.length, 0);
        assert.ok(result.parsedWorkflow);
        assert.equal(result.parsedWorkflow.id, "test-workflow");
        assert.equal(result.parsedWorkflow.name, "Test Workflow");
      });

      it("should accept valid workflow with optional fields", () => {
        const yaml = `
id: complex-workflow
name: Complex Test Workflow
version: 2
agents:
  - id: dev
    name: Developer Agent
    description: Handles development tasks
    role: coding
    model: claude-sonnet
    timeoutSeconds: 3600
    workspace:
      baseDir: /workspace
      files:
        README.md: "# Project"
        config.json: "{ test: true }"
      skills:
        - git
        - node
  - id: tester
    workspace:
      baseDir: /test-workspace
      files:
        test.ts: "test code"
steps:
  - id: develop
    agent: dev
    input: Implement feature
    expects: Code complete
  - id: test
    agent: tester
    input: Run tests
    expects: All tests pass
  - id: verify
    agent: dev
    type: loop
    loop:
      over: stories
      completion: all_done
      verifyEach: true
      verifyStep: test
    input: Verify all stories
    expects: All verified
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, true);
        assert.equal(result.errors.length, 0);
        assert.ok(result.parsedWorkflow);
        assert.equal(result.parsedWorkflow.id, "complex-workflow");
        assert.equal(result.parsedWorkflow.version, 2);
        assert.equal(result.parsedWorkflow.agents.length, 2);
        assert.equal(result.parsedWorkflow.steps.length, 3);
      });
    });

    describe("Detailed error messages", () => {
      it("should provide detailed error context", () => {
        const yaml = `
id: test_workflow
name: ""
agents:
  - id: dev_agent
    workspace:
      baseDir: ""
      files: {}
  - id: dev_agent
    workspace:
      baseDir: /test2
      files:
        file.txt: content
steps:
  - id: step1
    agent: unknown
    input: ""
    expects: ""
  - id: step1
    agent: dev_agent
    input: Do something
    expects: Success
`;
        const result = validateWorkflowYaml(yaml);
        
        assert.equal(result.valid, false);
        assert.ok(result.errors.length > 5);

        // Check that errors have proper context
        const errors = result.errors;
        assert.ok(errors.some(e => e.code === "INVALID_ID_FORMAT"));
        assert.ok(errors.some(e => e.code === "INVALID_NAME"));
        assert.ok(errors.some(e => e.code === "INVALID_AGENT_ID_FORMAT"));
        assert.ok(errors.some(e => e.code === "DUPLICATE_AGENT_ID"));
        assert.ok(errors.some(e => e.code === "INVALID_BASE_DIR"));
        assert.ok(errors.some(e => e.code === "INVALID_WORKSPACE_FILES"));
        assert.ok(errors.some(e => e.code === "DUPLICATE_STEP_ID"));
        assert.ok(errors.some(e => e.code === "UNKNOWN_AGENT_REFERENCE"));
      });
    });
  });
});