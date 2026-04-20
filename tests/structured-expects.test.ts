import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findMissingStructuredExpectSnippets,
  getStructuredExpectSnippets,
} from "../dist/installer/step-ops.js";

describe("structured expects validation", () => {
  it("enforces single-line KEY: value expects", () => {
    assert.deepEqual(getStructuredExpectSnippets("STATUS: done"), ["STATUS: done"]);
    assert.deepEqual(
      findMissingStructuredExpectSnippets("STATUS: retry\nFAILURES:\n- nope", "STATUS: done"),
      ["STATUS: done"],
    );
  });

  it("keeps plain single-line expects advisory for backwards compatibility", () => {
    assert.deepEqual(getStructuredExpectSnippets("RESULT"), []);
    assert.deepEqual(
      findMissingStructuredExpectSnippets("", "RESULT"),
      [],
    );
  });

  it("requires every non-empty line in a multi-line expects block", () => {
    const expects = ["STATUS: done", "REPO:", "BRANCH:", "STORIES_JSON:"].join("\n");
    const output = [
      "STATUS: done",
      "REPO: /tmp/repo",
      "BRANCH: feat/search",
      'STORIES_JSON: [{"id":"US-001"}]',
    ].join("\n");

    assert.deepEqual(findMissingStructuredExpectSnippets(output, expects), []);
  });

  it("reports missing snippets from a multi-line expects block", () => {
    const expects = ["STATUS: done", "REPO:", "BRANCH:", "STORIES_JSON:"].join("\n");
    const output = "STATUS: done\nREPO: /tmp/repo";

    assert.deepEqual(findMissingStructuredExpectSnippets(output, expects), [
      "BRANCH:",
      "STORIES_JSON:",
    ]);
  });
});
