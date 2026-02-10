import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { multiply } from "./multiply.js";

describe("multiply", () => {
  it("multiplies positive integers", () => {
    assert.equal(multiply(2, 3), 6);
  });

  it("multiplies with negatives", () => {
    assert.equal(multiply(-2, 3), -6);
  });

  it("multiplies by zero", () => {
    assert.equal(multiply(0, 5), 0);
  });

  it("multiplies decimals", () => {
    assert.equal(multiply(2.5, 2), 5);
  });
});
