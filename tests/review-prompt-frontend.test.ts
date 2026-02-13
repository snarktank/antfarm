import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflowPath = resolve(
  import.meta.dirname,
  "../workflows/feature-dev/workflow.yml"
);
const workflowContent = readFileSync(workflowPath, "utf-8");

// Extract the review step input section
function getReviewInput(): string {
  // Find the review step
  const reviewMatch = workflowContent.match(
    /- id: review\s+agent: reviewer\s+input: \|\n([\s\S]*?)(?=\n\s+expects:)/
  );
  assert.ok(reviewMatch, "review step with input block must exist");
  return reviewMatch[1];
}

describe("Review step frontend visual verification", () => {
  it("contains conditional browser verification referencing has_frontend_changes", () => {
    const input = getReviewInput();
    assert.ok(
      input.includes("{{has_frontend_changes}}"),
      "must reference {{has_frontend_changes}}"
    );
    assert.ok(
      input.includes("Visual Review"),
      "must have Visual Review section"
    );
  });

  it("instructs to check out branch, open page, take screenshot, verify visual quality", () => {
    const input = getReviewInput();
    assert.ok(input.includes("screenshot"), "must mention screenshot");
    assert.ok(
      input.includes("agent-browser"),
      "must reference agent-browser skill"
    );
    assert.ok(
      input.includes("{{branch}}"),
      "must reference branch variable"
    );
  });

  it("differentiates from verify step — focuses on polish and design quality", () => {
    const input = getReviewInput();
    assert.ok(
      input.includes("polish"),
      "must mention polish"
    );
    assert.ok(
      input.includes("design"),
      "must mention design"
    );
    assert.ok(
      input.includes("DESIGN review"),
      "must clarify this is a design review"
    );
  });

  it("skips visual review when has_frontend_changes is false", () => {
    const input = getReviewInput();
    assert.ok(
      input.includes("'false', skip visual review"),
      "must instruct to skip when false"
    );
  });

  it("template resolves correctly with has_frontend_changes=true", () => {
    const input = getReviewInput();
    const resolved = input.replace(/\{\{has_frontend_changes\}\}/g, "true");
    assert.ok(resolved.includes("true"));
    assert.ok(!resolved.includes("{{has_frontend_changes}}"));
  });

  it("template resolves correctly with has_frontend_changes=false", () => {
    const input = getReviewInput();
    const resolved = input.replace(/\{\{has_frontend_changes\}\}/g, "false");
    assert.ok(resolved.includes("false"));
    assert.ok(!resolved.includes("{{has_frontend_changes}}"));
  });

  it("review visual section is distinct from verify visual section", () => {
    // Verify step uses "Visual Verification", review uses "Visual Review"
    const reviewInput = getReviewInput();
    assert.ok(
      reviewInput.includes("Visual Review"),
      "review uses 'Visual Review'"
    );
    assert.ok(
      !reviewInput.includes("Visual Verification"),
      "review should not use verify's heading"
    );
  });
});
