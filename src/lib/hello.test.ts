import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { helloWorld } from "./hello.js";

describe("helloWorld", () => {
  it("is a function", () => {
    assert.equal(typeof helloWorld, "function");
  });

  it("returns void (not a Promise)", () => {
    const result = helloWorld();
    assert.equal(result, undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.ok(
      !((result as any) instanceof Promise),
      "helloWorld() should not return a Promise"
    );
  });

  it("outputs Hello World to console", () => {
    // Capture console.log output
    const originalLog = console.log;
    let capturedOutput = "";

    console.log = (...args: unknown[]) => {
      capturedOutput = args.join(" ");
    };

    helloWorld();

    // Restore console.log
    console.log = originalLog;

    assert.equal(capturedOutput, "Hello World");
  });
});
