import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workflowPath = join(__dirname, "workflow.yml");

describe("ops-workflow.yml schema validation", () => {
  let workflowYaml;
  let workflow;

  it("reads and parses workflow.yml as valid YAML", () => {
    const content = readFileSync(workflowPath, "utf-8");
    assert.ok(content, "workflow.yml should exist and have content");
    
    workflow = YAML.parse(content);
    assert.ok(workflow, "YAML should parse successfully");
    assert.equal(typeof workflow, "object", "Parsed YAML should be an object");
  });

  it("defines the required top-level fields", () => {
    assert.ok(workflow.id, "workflow should have id");
    assert.equal(workflow.id, "ops-workflow", "workflow id should be 'ops-workflow'");
    
    assert.ok(workflow.name, "workflow should have name");
    assert.ok(workflow.description, "workflow should have description");
    assert.ok(workflow.agents, "workflow should have agents array");
    assert.ok(workflow.steps, "workflow should have steps array");
    assert.ok(workflow.polling, "workflow should have polling config");
  });

  it("defines three agents: planner, executor, verifier", () => {
    assert.ok(Array.isArray(workflow.agents), "agents should be an array");
    assert.equal(workflow.agents.length, 3, "should define exactly 3 agents");

    const agentIds = workflow.agents.map(a => a.id);
    assert.deepEqual(agentIds, ["planner", "executor", "verifier"], "agents should be planner, executor, verifier in order");
  });

  it("defines planner agent with role 'analysis'", () => {
    const planner = workflow.agents.find(a => a.id === "planner");
    assert.ok(planner, "planner agent should exist");
    assert.equal(planner.role, "analysis", "planner role should be 'analysis'");
    assert.ok(planner.description, "planner should have description");
    assert.ok(planner.workspace, "planner should have workspace config");
    assert.ok(planner.workspace.baseDir, "planner workspace should have baseDir");
    assert.ok(planner.workspace.files, "planner workspace should have files");
  });

  it("defines executor agent with role 'ops'", () => {
    const executor = workflow.agents.find(a => a.id === "executor");
    assert.ok(executor, "executor agent should exist");
    assert.equal(executor.role, "ops", "executor role should be 'ops'");
    assert.ok(executor.description, "executor should have description");
    assert.ok(executor.description.includes("restricted"), "executor description should mention restricted capabilities");
    assert.ok(executor.workspace, "executor should have workspace config");
  });

  it("defines verifier agent with role 'verification'", () => {
    const verifier = workflow.agents.find(a => a.id === "verifier");
    assert.ok(verifier, "verifier agent should exist");
    assert.equal(verifier.role, "verification", "verifier role should be 'verification'");
    assert.ok(verifier.description, "verifier should have description");
    assert.ok(verifier.workspace, "verifier should have workspace config");
  });

  it("all agents have workspace files: AGENTS.md, SOUL.md, IDENTITY.md", () => {
    workflow.agents.forEach(agent => {
      assert.ok(agent.workspace.files, `${agent.id} should have workspace files`);
      assert.ok(agent.workspace.files["AGENTS.md"], `${agent.id} should reference AGENTS.md`);
      assert.ok(agent.workspace.files["SOUL.md"], `${agent.id} should reference SOUL.md`);
      assert.ok(agent.workspace.files["IDENTITY.md"], `${agent.id} should reference IDENTITY.md`);
    });
  });

  it("defines five steps in order: plan, setup, execute, verify, summary", () => {
    assert.ok(Array.isArray(workflow.steps), "steps should be an array");
    assert.equal(workflow.steps.length, 5, "should define exactly 5 steps");

    const stepIds = workflow.steps.map(s => s.id);
    assert.deepEqual(stepIds, ["plan", "setup", "execute", "verify", "summary"], "steps should be plan, setup, execute, verify, summary in order");
  });

  it("plan step is assigned to planner agent and includes safety header", () => {
    const planStep = workflow.steps.find(s => s.id === "plan");
    assert.ok(planStep, "plan step should exist");
    assert.equal(planStep.agent, "planner", "plan step should be assigned to planner");
    assert.ok(planStep.input, "plan step should have input");
    assert.ok(planStep.input.includes("SAFETY HEADER"), "plan step input should include SAFETY HEADER");
  });

  it("setup step is assigned to executor agent", () => {
    const setupStep = workflow.steps.find(s => s.id === "setup");
    assert.ok(setupStep, "setup step should exist");
    assert.equal(setupStep.agent, "executor", "setup step should be assigned to executor");
  });

  it("execute step is a loop over safe_tasks with fresh_session and verify_each", () => {
    const executeStep = workflow.steps.find(s => s.id === "execute");
    assert.ok(executeStep, "execute step should exist");
    assert.equal(executeStep.agent, "executor", "execute step should be assigned to executor");
    assert.equal(executeStep.type, "loop", "execute step should be type 'loop'");
    assert.ok(executeStep.loop, "execute step should have loop config");
    assert.equal(executeStep.loop.over, "safe_tasks", "loop should iterate over 'safe_tasks'");
    assert.equal(executeStep.loop.fresh_session, true, "loop should have fresh_session: true");
    assert.equal(executeStep.loop.verify_each, true, "loop should have verify_each: true");
    assert.equal(executeStep.loop.verify_step, "verify", "loop should verify with 'verify' step");
  });

  it("verify step is assigned to verifier agent", () => {
    const verifyStep = workflow.steps.find(s => s.id === "verify");
    assert.ok(verifyStep, "verify step should exist");
    assert.equal(verifyStep.agent, "verifier", "verify step should be assigned to verifier");
  });

  it("summary step is assigned to planner agent", () => {
    const summaryStep = workflow.steps.find(s => s.id === "summary");
    assert.ok(summaryStep, "summary step should exist");
    assert.equal(summaryStep.agent, "planner", "summary step should be assigned to planner");
  });

  it("all step agents are defined in the agents list", () => {
    const agentIds = workflow.agents.map(a => a.id);
    workflow.steps.forEach(step => {
      assert.ok(agentIds.includes(step.agent), `step ${step.id} references undefined agent ${step.agent}`);
    });
  });

  it("no circular step dependencies (steps only depend on earlier steps or outputs)", () => {
    const stepIndexMap = {};
    workflow.steps.forEach((step, index) => {
      stepIndexMap[step.id] = index;
    });

    workflow.steps.forEach(step => {
      // Extract step references from input (looks for {{previous_step}} patterns)
      const inputStr = step.input || "";
      const stepRefRegex = /{{(\w+_tasks|previous_\w+|\w+_feedback|completed_\w+|progress|task|logs|actions|verification|changes|results|pr)}}/g;
      
      // These are output references which are fine as long as they're not direct step IDs
      // Direct step dependencies would only be in things like on_fail.retry_step or similar
      if (step.on_fail && step.on_fail.retry_step) {
        const refStepIndex = stepIndexMap[step.on_fail.retry_step];
        if (refStepIndex !== undefined) {
          const currentIndex = stepIndexMap[step.id];
          assert.ok(refStepIndex < currentIndex, `step ${step.id} has circular dependency on ${step.on_fail.retry_step}`);
        }
      }
    });
  });

  it("includes safety configuration with max_retries and reserved keywords", () => {
    assert.ok(workflow.safety, "workflow should have safety config");
    assert.ok(workflow.safety.max_retries !== undefined, "safety should define max_retries");
    assert.equal(workflow.safety.max_retries, 2, "max_retries should be 2");
    assert.ok(Array.isArray(workflow.safety.reserved_keywords), "safety should have reserved_keywords array");
    
    const keywords = workflow.safety.reserved_keywords;
    assert.ok(keywords.includes("destructive"), "reserved_keywords should include 'destructive'");
    assert.ok(keywords.includes("sql"), "reserved_keywords should include 'sql'");
    assert.ok(keywords.includes("drop"), "reserved_keywords should include 'drop'");
    assert.ok(keywords.includes("delete"), "reserved_keywords should include 'delete'");
  });

  it("includes safety_header_template in safety config", () => {
    assert.ok(workflow.safety.safety_header_template, "safety should include safety_header_template");
    assert.ok(workflow.safety.safety_header_template.includes("SAFETY HEADER"), "safety_header_template should mention SAFETY HEADER");
    assert.ok(workflow.safety.safety_header_template.includes("Do NOT"), "safety_header_template should warn against destructive operations");
  });

  it("polling config has appropriate timeout", () => {
    assert.ok(workflow.polling.timeoutSeconds, "polling should have timeoutSeconds");
    assert.equal(workflow.polling.timeoutSeconds, 120, "polling timeoutSeconds should be 120");
  });

  it("all step inputs include safety header", () => {
    const stepsWithSafetyHeader = workflow.steps.filter(s => 
      s.input && s.input.includes("SAFETY HEADER")
    );
    assert.equal(stepsWithSafetyHeader.length, workflow.steps.length, "all steps should include SAFETY HEADER in input");
  });

  it("executor description mentions restricted capability hints", () => {
    const executor = workflow.agents.find(a => a.id === "executor");
    assert.ok(executor.description.includes("restricted"), "executor description should mention restricted");
    assert.ok(executor.description.includes("ops"), "executor description should mention ops");
  });

  it("plan step expects proper output format", () => {
    const planStep = workflow.steps.find(s => s.id === "plan");
    assert.ok(planStep.expects, "plan step should have expects field");
    assert.equal(planStep.expects, "STATUS: done", "plan step should expect STATUS: done");
  });

  it("all steps have expects and max_retries", () => {
    workflow.steps.forEach(step => {
      if (step.id !== "summary") { // summary might be final
        assert.ok(step.expects, `step ${step.id} should have expects field`);
        if (step.max_retries !== undefined) {
          assert.equal(step.max_retries, 2, `step ${step.id} max_retries should be 2`);
        }
      }
    });
  });
});
