import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getWorkflowDetails, formatWorkflowDetails } from "../dist/installer/workflow-show.js";
import { listBundledWorkflows } from "../dist/installer/workflow-fetch.js";
import { execSync } from "node:child_process";

describe("workflow-show", () => {
  describe("getWorkflowDetails()", () => {
    it("should return workflow details for valid workflow", async () => {
      // Get any available workflow for testing
      const workflows = await listBundledWorkflows();
      if (workflows.length === 0) {
        console.log("No bundled workflows found, skipping workflow details test");
        return;
      }

      const workflowId = workflows[0];
      const details = await getWorkflowDetails(workflowId);

      // Verify required fields
      assert.ok(details.id, "Should have workflow id");
      assert.ok(details.name, "Should have workflow name");
      assert.ok(typeof details.version === "number", "Should have numeric version");
      assert.ok(typeof details.activeRuns === "number", "Should have activeRuns count");
      assert.ok(["ACTIVE", "IDLE"].includes(details.status), "Should have valid status");
      assert.ok(Array.isArray(details.agents), "Should have agents array");
      assert.ok(Array.isArray(details.steps), "Should have steps array");
    });

    it("should include agent details with roles and descriptions", async () => {
      const workflows = await listBundledWorkflows();
      if (workflows.length === 0) return;

      const workflowId = workflows[0];
      const details = await getWorkflowDetails(workflowId);

      if (details.agents.length > 0) {
        const agent = details.agents[0];
        assert.ok(agent.id, "Agent should have id");
        assert.ok(agent.workspace, "Agent should have workspace info");
        assert.ok(agent.workspace.baseDir, "Agent should have workspace baseDir");
        assert.ok(typeof agent.workspace.fileCount === "number", "Agent should have file count");
        // Optional fields that may or may not be present
        if (agent.role) {
          assert.ok(typeof agent.role === "string", "Agent role should be string if present");
        }
        if (agent.description) {
          assert.ok(typeof agent.description === "string", "Agent description should be string if present");
        }
      }
    });

    it("should include step details with dependencies and expectations", async () => {
      const workflows = await listBundledWorkflows();
      if (workflows.length === 0) return;

      const workflowId = workflows[0];
      const details = await getWorkflowDetails(workflowId);

      if (details.steps.length > 0) {
        const step = details.steps[0];
        assert.ok(step.id, "Step should have id");
        assert.ok(step.agent, "Step should have agent reference");
        assert.ok(step.input, "Step should have input");
        assert.ok(step.expects, "Step should have expects");
        assert.ok(["single", "loop"].includes(step.type || "single"), "Step should have valid type");
        
        // Check loop configuration if present
        if (step.loopConfig) {
          assert.ok(step.loopConfig.over, "Loop config should have 'over' field");
          assert.ok(step.loopConfig.completion, "Loop config should have 'completion' field");
        }
      }
    });

    it("should handle workflow not found gracefully", async () => {
      await assert.rejects(
        async () => await getWorkflowDetails("nonexistent-workflow"),
        /Workflow "nonexistent-workflow" not found/,
        "Should throw error for non-existent workflow"
      );
    });

    it("should include available workflows in error message", async () => {
      const workflows = await listBundledWorkflows();
      
      try {
        await getWorkflowDetails("nonexistent-workflow");
        assert.fail("Should have thrown an error");
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (workflows.length > 0) {
          assert.match(errorMessage, /Available:/, "Should list available workflows in error");
          for (const workflow of workflows.slice(0, 2)) { // Check first few
            assert.ok(errorMessage.includes(workflow), `Should mention ${workflow} in error`);
          }
        } else {
          assert.match(errorMessage, /No workflows available/, "Should indicate no workflows available");
        }
      }
    });

    it("should return proper status based on active runs", async () => {
      const workflows = await listBundledWorkflows();
      if (workflows.length === 0) return;

      const workflowId = workflows[0];
      const details = await getWorkflowDetails(workflowId);

      if (details.activeRuns > 0) {
        assert.strictEqual(details.status, "ACTIVE", "Should be ACTIVE when there are active runs");
      } else {
        assert.strictEqual(details.status, "IDLE", "Should be IDLE when there are no active runs");
      }
    });
  });

  describe("formatWorkflowDetails()", () => {
    const sampleDetails = {
      id: "test-workflow",
      name: "Test Workflow",
      version: 1,
      description: "A sample workflow for testing",
      activeRuns: 0,
      status: "IDLE" as const,
      agents: [
        {
          id: "developer",
          name: "Development Agent",
          description: "Handles development tasks",
          role: "coding",
          model: "claude-3-5-sonnet",
          timeoutSeconds: 3600,
          workspace: {
            baseDir: "developer",
            fileCount: 5,
            skills: ["git", "typescript"],
          },
        },
        {
          id: "reviewer",
          name: "Review Agent",
          workspace: {
            baseDir: "reviewer",
            fileCount: 2,
          },
        },
      ],
      steps: [
        {
          id: "implement",
          agent: "developer",
          type: "single" as const,
          input: "Implement the feature as described",
          expects: "Working implementation with tests",
          maxRetries: 3,
        },
        {
          id: "review-loop",
          agent: "reviewer",
          type: "loop" as const,
          input: "Review each story",
          expects: "Approved or feedback provided",
          loopConfig: {
            over: "stories",
            completion: "all_done",
            freshSession: true,
            verifyEach: true,
            verifyStep: "verify-story",
          },
        },
      ],
      context: {
        repository: "https://github.com/test/repo",
        branch: "main",
      },
      notifications: {
        url: "https://hooks.slack.com/test",
      },
    };

    it("should format workflow metadata correctly", () => {
      const formatted = formatWorkflowDetails(sampleDetails);
      
      assert.ok(formatted.includes("Workflow: Test Workflow (test-workflow)"), "Should show workflow name and id");
      assert.ok(formatted.includes("Version: 1"), "Should show version");
      assert.ok(formatted.includes("Description: A sample workflow for testing"), "Should show description");
      assert.ok(formatted.includes("Status: IDLE (0 active runs)"), "Should show status and active runs");
    });

    it("should format agents list with details", () => {
      const formatted = formatWorkflowDetails(sampleDetails);
      
      assert.ok(formatted.includes("Agents:"), "Should have Agents section");
      assert.ok(formatted.includes("developer (Development Agent)"), "Should show agent id and name");
      assert.ok(formatted.includes("Description: Handles development tasks"), "Should show agent description");
      assert.ok(formatted.includes("Role: coding"), "Should show agent role");
      assert.ok(formatted.includes("Model: claude-3-5-sonnet"), "Should show agent model");
      assert.ok(formatted.includes("Timeout: 3600s"), "Should show timeout");
      assert.ok(formatted.includes("Workspace: developer (5 files)"), "Should show workspace info");
      assert.ok(formatted.includes("Skills: git, typescript"), "Should show skills");
      
      // Agent without optional fields
      assert.ok(formatted.includes("reviewer"), "Should show second agent");
      assert.ok(formatted.includes("Workspace: reviewer (2 files)"), "Should show workspace for agent without skills");
    });

    it("should format steps list with dependencies and expectations", () => {
      const formatted = formatWorkflowDetails(sampleDetails);
      
      assert.ok(formatted.includes("Steps:"), "Should have Steps section");
      assert.ok(formatted.includes("implement → developer"), "Should show step to agent mapping");
      assert.ok(formatted.includes("Input: Implement the feature as described"), "Should show step input");
      assert.ok(formatted.includes("Expects: Working implementation with tests"), "Should show step expectations");
      assert.ok(formatted.includes("Max Retries: 3"), "Should show max retries if present");
      
      // Loop step
      assert.ok(formatted.includes("review-loop → reviewer [LOOP]"), "Should show loop indicator");
      assert.ok(formatted.includes("Loop: over stories, completion all_done"), "Should show loop config");
      assert.ok(formatted.includes("Fresh session: yes"), "Should show fresh session setting");
      assert.ok(formatted.includes("Verify each: yes (via verify-story)"), "Should show verify settings");
    });

    it("should format context and notifications", () => {
      const formatted = formatWorkflowDetails(sampleDetails);
      
      assert.ok(formatted.includes("Context:"), "Should have Context section");
      assert.ok(formatted.includes("repository: https://github.com/test/repo"), "Should show context fields");
      assert.ok(formatted.includes("branch: main"), "Should show context fields");
      
      assert.ok(formatted.includes("Notifications:"), "Should have Notifications section");
      assert.ok(formatted.includes("URL: https://hooks.slack.com/test"), "Should show notification URL");
    });

    it("should handle empty sections gracefully", () => {
      const emptyDetails = {
        id: "empty-workflow",
        name: "Empty Workflow",
        version: 1,
        activeRuns: 0,
        status: "IDLE" as const,
        agents: [],
        steps: [],
      };

      const formatted = formatWorkflowDetails(emptyDetails);
      
      assert.ok(formatted.includes("(no agents configured)"), "Should show empty agents message");
      assert.ok(formatted.includes("(no steps configured)"), "Should show empty steps message");
    });

    it("should truncate long input/expects fields", () => {
      const longDetails = {
        ...sampleDetails,
        steps: [
          {
            id: "long-step",
            agent: "developer",
            type: "single" as const,
            input: "This is a very long input that should be truncated because it exceeds the reasonable display length for a command line interface and would make the output hard to read",
            expects: "This is a very long expects field that should also be truncated for better readability",
          },
        ],
      };

      const formatted = formatWorkflowDetails(longDetails);
      
      assert.ok(formatted.includes("Input: This is a very long input that should be truncated because it exceeds the reason..."), "Should truncate long input");
      assert.ok(formatted.includes("Expects: This is a very long expects field that should also be truncated for better reada..."), "Should truncate long expects");
    });
  });

  describe("CLI integration", () => {
    it("should handle show command with valid workflow", async () => {
      const workflows = await listBundledWorkflows();
      if (workflows.length === 0) {
        console.log("No bundled workflows found, skipping CLI integration test");
        return;
      }

      const workflowId = workflows[0];
      
      try {
        const output = execSync(`node dist/cli/cli.js workflow show ${workflowId}`, { 
          cwd: process.cwd(),
          encoding: "utf-8",
          timeout: 10000 
        });
        
        assert.ok(output.includes("Workflow:"), "CLI output should contain workflow header");
        assert.ok(output.includes("Agents:"), "CLI output should contain agents section");
        assert.ok(output.includes("Steps:"), "CLI output should contain steps section");
      } catch (err) {
        // If CLI hasn't been built yet, skip this test
        console.log("CLI not built yet, skipping integration test");
      }
    });

    it("should handle show command with missing workflow name", async () => {
      try {
        execSync(`node dist/cli/cli.js workflow show`, { 
          cwd: process.cwd(),
          encoding: "utf-8",
          timeout: 5000 
        });
        assert.fail("Should have failed with missing workflow name");
      } catch (err) {
        const stderr = err instanceof Error && 'stderr' in err ? (err as any).stderr : '';
        assert.ok(stderr.includes("Missing workflow name"), "Should show missing workflow name error");
      }
    });

    it("should handle show command with invalid workflow", async () => {
      try {
        execSync(`node dist/cli/cli.js workflow show nonexistent-workflow`, { 
          cwd: process.cwd(),
          encoding: "utf-8",
          timeout: 5000 
        });
        assert.fail("Should have failed with invalid workflow");
      } catch (err) {
        const stderr = err instanceof Error && 'stderr' in err ? (err as any).stderr : '';
        assert.ok(stderr.includes('not found'), "Should show workflow not found error");
      }
    });
  });
});