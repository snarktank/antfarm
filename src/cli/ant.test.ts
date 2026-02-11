import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { printAnt } from "./ant.js";

describe("printAnt", () => {
  let output: string;
  const originalWrite = process.stdout.write;

  beforeEach(() => {
    output = "";
    process.stdout.write = ((chunk: string) => {
      output += chunk;
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  it("prints ASCII art containing ant-like shapes", () => {
    printAnt();
    // Check for key parts of the ant ASCII art
    assert.ok(output.includes("---"), "should contain dashes for ant body");
    assert.ok(output.includes("\\"), "should contain backslash characters");
  });

  it("prints a quote after the art", () => {
    printAnt();
    const lines = output.trim().split("\n");
    const lastLine = lines[lines.length - 1];
    // Quote should be a non-empty string
    assert.ok(lastLine.length > 10, "last line should be a quote");
  });

  it("picks from at least 8 different quotes", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      output = "";
      printAnt();
      const lines = output.trim().split("\n");
      seen.add(lines[lines.length - 1]);
    }
    assert.ok(seen.size >= 8, `expected at least 8 unique quotes, got ${seen.size}`);
  });

  it("does not throw", () => {
    assert.doesNotThrow(() => printAnt());
  });
});
