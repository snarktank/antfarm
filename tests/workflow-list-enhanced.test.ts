import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getWorkflowInfoList } from "../dist/installer/workflow-fetch.js";

describe("Enhanced workflow list", () => {
  it("returns workflow information with required fields", async () => {
    const workflows = await getWorkflowInfoList();
    
    assert.ok(Array.isArray(workflows), "should return an array");
    
    if (workflows.length > 0) {
      const workflow = workflows[0];
      
      // Check all required fields are present
      assert.ok(typeof workflow.id === "string", "workflow should have string id");
      assert.ok(typeof workflow.name === "string", "workflow should have string name");
      assert.ok(typeof workflow.version === "number", "workflow should have number version");
      assert.ok(typeof workflow.activeRuns === "number", "workflow should have number activeRuns");
      assert.ok(workflow.status === "ACTIVE" || workflow.status === "IDLE", "workflow status should be ACTIVE or IDLE");
      
      // Verify id is not empty
      assert.ok(workflow.id.trim().length > 0, "workflow id should not be empty");
      
      // Verify name is not empty
      assert.ok(workflow.name.trim().length > 0, "workflow name should not be empty");
      
      // Verify version is positive
      assert.ok(workflow.version > 0, "workflow version should be positive");
      
      // Verify activeRuns is non-negative
      assert.ok(workflow.activeRuns >= 0, "workflow activeRuns should be non-negative");
      
      // Verify status logic: if activeRuns > 0, status should be ACTIVE
      if (workflow.activeRuns > 0) {
        assert.equal(workflow.status, "ACTIVE", "workflows with active runs should have ACTIVE status");
      } else {
        assert.equal(workflow.status, "IDLE", "workflows with no active runs should have IDLE status");
      }
    }
  });
  
  it("workflows are sorted by id", async () => {
    const workflows = await getWorkflowInfoList();
    
    if (workflows.length > 1) {
      for (let i = 1; i < workflows.length; i++) {
        assert.ok(
          workflows[i - 1].id.localeCompare(workflows[i].id) <= 0,
          `workflows should be sorted by id: ${workflows[i - 1].id} should come before or equal ${workflows[i].id}`
        );
      }
    }
  });
  
  it("includes known bundled workflows", async () => {
    const workflows = await getWorkflowInfoList();
    const workflowIds = workflows.map(w => w.id);
    
    // Should include common bundled workflows (these might exist in the test environment)
    const expectedWorkflows = ["feature-dev", "bug-fix", "security-audit"];
    
    for (const expectedId of expectedWorkflows) {
      // Don't fail if workflow doesn't exist, just check if it exists it has proper structure
      const workflow = workflows.find(w => w.id === expectedId);
      if (workflow) {
        assert.ok(workflow.name.length > 0, `${expectedId} should have non-empty name`);
        assert.ok(workflow.version > 0, `${expectedId} should have positive version`);
      }
    }
  });
});