import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hello } from "./hello.js";

describe("hello", () => {
  describe("hello()", () => {
    it("returns 'Hello, World!' when called with no arguments", () => {
      const result = hello();
      assert.equal(result, "Hello, World!");
    });

    it("returns 'Hello, {name}!' when called with a name", () => {
      const result = hello("Antfarm");
      assert.equal(result, "Hello, Antfarm!");
    });

    it("handles custom names correctly", () => {
      const result = hello("Alice");
      assert.equal(result, "Hello, Alice!");
    });

    it("handles empty string as name", () => {
      const result = hello("");
      assert.equal(result, "Hello, !");
    });
  });

  describe("exports", () => {
    it("exports hello function", () => {
      assert.equal(typeof hello, "function");
    });
  });
});
