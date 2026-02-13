import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflowPath = resolve(import.meta.dirname, "../workflows/feature-dev/workflow.yml");
const workflowContent = readFileSync(workflowPath, "utf-8");

// Extract the verify step input template
function getVerifyInput(): string {
  // Find the verify step and extract its input block
  const lines = workflowContent.split("\n");
  let inVerify = false;
  let inInput = false;
  let inputLines: string[] = [];
  let inputIndent = 0;

  for (const line of lines) {
    if (line.match(/^\s*- id: verify\b/)) {
      inVerify = true;
      continue;
    }
    if (inVerify && line.match(/^\s*- id: \w/)) {
      break; // next step
    }
    if (inVerify && line.match(/^\s*input: \|/)) {
      inInput = true;
      inputIndent = line.indexOf("input:") + 2; // block scalar indentation
      continue;
    }
    if (inInput) {
      // Block scalar continues while indented more than the key
      if (line.trim() === "" || line.match(new RegExp(`^\\s{${inputIndent}}`))) {
        inputLines.push(line);
      } else {
        break;
      }
    }
  }
  return inputLines.join("\n");
}

describe("Verify step prompt - frontend conditional", () => {
  const verifyInput = getVerifyInput();

  it("contains has_frontend_changes template variable", () => {
    assert.ok(
      verifyInput.includes("{{has_frontend_changes}}"),
      "Verify input should reference {{has_frontend_changes}}"
    );
  });

  it("includes browser verification instructions when frontend changes present", () => {
    assert.ok(
      verifyInput.includes("agent-browser"),
      "Should reference agent-browser skill"
    );
    assert.ok(
      verifyInput.includes("screenshot"),
      "Should instruct to take a screenshot"
    );
    assert.ok(
      verifyInput.includes("visually"),
      "Should instruct visual confirmation"
    );
  });

  it("specifies what constitutes a visual pass", () => {
    assert.ok(
      verifyInput.includes("visual PASS"),
      "Should define visual pass criteria"
    );
    assert.ok(
      verifyInput.includes("renders without broken layout"),
      "Should specify rendering check"
    );
  });

  it("specifies what constitutes a visual failure", () => {
    assert.ok(
      verifyInput.includes("visual FAIL"),
      "Should define visual fail criteria"
    );
    assert.ok(
      verifyInput.includes("broken layout"),
      "Should mention broken layout as failure"
    );
    assert.ok(
      verifyInput.includes("missing"),
      "Should mention missing elements as failure"
    );
    assert.ok(
      verifyInput.includes("overlapping"),
      "Should mention overlapping content as failure"
    );
  });

  it("instructs to skip visual verification when has_frontend_changes is false", () => {
    assert.ok(
      verifyInput.includes("'false', skip visual verification"),
      "Should instruct to skip when no frontend changes"
    );
  });

  it("instructs to open file or start local server", () => {
    assert.ok(
      verifyInput.includes("Open the changed HTML file") || verifyInput.includes("local dev server"),
      "Should instruct to open file or start server"
    );
  });

  it("checks layout, styling, and visibility", () => {
    assert.ok(verifyInput.includes("Layout"), "Should check layout");
    assert.ok(verifyInput.includes("Styling"), "Should check styling");
    assert.ok(verifyInput.includes("present and properly positioned"), "Should check element visibility");
  });
});
