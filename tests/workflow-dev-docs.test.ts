import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("workflow-dev documentation", () => {
  it("documents workflow-dev in README workflow catalog with pipeline summary", () => {
    const readme = readFileSync(path.resolve("README.md"), "utf-8");

    assert.ok(readme.includes("### workflow-dev `6 agents`"));
    assert.ok(readme.includes("plan → specify → setup → implement → verify → PR"));
  });

  it("includes a runnable workflow-dev command example", () => {
    const readme = readFileSync(path.resolve("README.md"), "utf-8");
    const docs = readFileSync(path.resolve("docs/creating-workflows.md"), "utf-8");

    assert.ok(readme.includes('antfarm workflow run workflow-dev "Create a customer-onboarding workflow with setup, implement, verify, and pr steps"'));
    assert.ok(docs.includes("antfarm workflow install workflow-dev"));
    assert.ok(docs.includes('antfarm workflow run workflow-dev "Create an incident-response workflow for production outages"'));
  });

  it("documents required task structure and KEY: value output contract", () => {
    const docs = readFileSync(path.resolve("docs/creating-workflows.md"), "utf-8");

    assert.ok(docs.includes("Goal:"));
    assert.ok(docs.includes("Pipeline:"));
    assert.ok(docs.includes("Acceptance Criteria:"));
    assert.ok(docs.includes("Typecheck passes"));

    assert.ok(docs.includes("Required output contract (KEY: value)"));
    assert.ok(docs.includes("`STORIES_JSON`"));
    assert.ok(docs.includes("`SPEC_JSON`"));
    assert.ok(docs.includes("`CREATED_FILES`"));
    assert.ok(docs.includes("`STATUS: retry`"));
    assert.ok(docs.includes("`ISSUES`"));
  });
});
