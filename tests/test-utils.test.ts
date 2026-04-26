import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateTestId } from "../dist/lib/test-utils.js";

describe("generateTestId", () => {
  it("is a function", () => {
    assert.equal(typeof generateTestId, "function");
  });

  it("returns a string", () => {
    const result = generateTestId();
    assert.equal(typeof result, "string");
  });

  it("returns a string in format TEST-XXXXX", () => {
    const result = generateTestId();
    assert.match(result, /^TEST-[A-Z0-9]{5}$/);
  });

  it("generates unique IDs (calling it twice produces different results)", () => {
    const id1 = generateTestId();
    const id2 = generateTestId();
    assert.notEqual(id1, id2, "generateTestId() should produce unique IDs");
  });
});
