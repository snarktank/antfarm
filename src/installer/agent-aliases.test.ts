import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AGENT_ALIASES, resolveAgentIds } from "./step-ops.js";

describe("AGENT_ALIASES", () => {
  it("maps feature-dev-developer to developer-2 and developer-3", () => {
    assert.deepStrictEqual(AGENT_ALIASES["feature-dev-developer"], [
      "feature-dev-developer-2",
      "feature-dev-developer-3",
    ]);
  });
});

describe("resolveAgentIds", () => {
  it("returns only self for an agent not in any alias group", () => {
    assert.deepStrictEqual(resolveAgentIds("some-other-agent"), ["some-other-agent"]);
  });

  it("returns only self for the primary agent (feature-dev-developer)", () => {
    assert.deepStrictEqual(resolveAgentIds("feature-dev-developer"), ["feature-dev-developer"]);
  });

  it("returns self + primary for feature-dev-developer-2", () => {
    const ids = resolveAgentIds("feature-dev-developer-2");
    assert.ok(ids.includes("feature-dev-developer-2"));
    assert.ok(ids.includes("feature-dev-developer"));
    assert.strictEqual(ids.length, 2);
  });

  it("returns self + primary for feature-dev-developer-3", () => {
    const ids = resolveAgentIds("feature-dev-developer-3");
    assert.ok(ids.includes("feature-dev-developer-3"));
    assert.ok(ids.includes("feature-dev-developer"));
    assert.strictEqual(ids.length, 2);
  });
});
