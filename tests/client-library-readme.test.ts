import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const readmePath = join(dirname(fileURLToPath(import.meta.url)), "../README.md");

describe("client library README stub", () => {
  it("documents the planned client library surface", async () => {
    const readme = await readFile(readmePath, "utf8");

    assert.ok(readme.includes("## Client Library"), "README is missing the Client Library heading");
    assert.ok(
      readme.includes("docs/client-library.md"),
      "README must reference docs/client-library.md for future docs",
    );
    assert.ok(
      readme.includes("- Programmatic workflow orchestration via the agent pipeline"),
      "README must mention programmatic workflow orchestration as a feature",
    );
    assert.ok(
      readme.includes("- CLI-friendly SDK for customizing workflows in Node.js"),
      "README must mention the CLI-friendly SDK surface",
    );
  });
});
