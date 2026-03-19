import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

const smokeTestModulePath = path.resolve(
  import.meta.dirname,
  "..",
  "src",
  "smoke-test.js",
);

describe("US-001: smoke test module", () => {
  it("imports successfully and exports run()", async () => {
    const module = await import(smokeTestModulePath);

    assert.equal(typeof module.run, "function");
  });

  it("matches the required smoke command output", () => {
    const output = execFileSync(
      "node",
      ["-e", `import(${JSON.stringify(smokeTestModulePath)}).then((m) => m.run())`],
      { encoding: "utf8" },
    );

    assert.equal(output, "Smoke test OK\n");
  });
});
