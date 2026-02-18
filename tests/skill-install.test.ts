/**
 * installer/skill-install.ts unit tests
 *
 * Tests installAntfarmSkill() — copies skill files from antfarm's bundled
 * skills directory to the user's ~/.openclaw/skills directory.
 * Mocks node:fs/promises and node:os to avoid real disk I/O.
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

// ── Mock state ──────────────────────────────────────────────────────

let mkdirCalls: Array<{ path: string; opts: unknown }> = [];
let accessCalls: string[] = [];
let readFileCalls: Array<{ path: string; enc: string }> = [];
let writeFileCalls: Array<{ path: string; content: string; enc: string }> = [];
let rmCalls: Array<{ path: string; opts: unknown }> = [];

let accessShouldThrow = false;
let readFileShouldThrow = false;
let readFileContent = "# Antfarm Workflows Skill\nThis is the skill content.";

// ── Module mocks ────────────────────────────────────────────────────

mock.module("node:os", {
  defaultExport: {
    homedir: () => "/fake/home",
  },
});

mock.module("node:fs/promises", {
  defaultExport: {
    mkdir: async (p: string, opts: unknown) => {
      mkdirCalls.push({ path: p, opts });
    },
    access: async (p: string) => {
      accessCalls.push(p);
      if (accessShouldThrow) {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      }
    },
    readFile: async (p: string, enc: string) => {
      readFileCalls.push({ path: p, enc });
      if (readFileShouldThrow) {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      }
      return readFileContent;
    },
    writeFile: async (p: string, content: string, enc: string) => {
      writeFileCalls.push({ path: p, content, enc });
    },
    rm: async (p: string, opts: unknown) => {
      rmCalls.push({ path: p, opts });
    },
  },
});

// Import after mocks
const { installAntfarmSkill, uninstallAntfarmSkill } = await import(
  "../dist/installer/skill-install.js"
);

// The dist/installer/ directory — import.meta.dirname resolves here at runtime
// so srcDir = path.join(import.meta.dirname, "..", "..", "skills", "antfarm-workflows")
// We can compute the expected paths using the actual dist location
const distInstallerDir = path.resolve(
  import.meta.dirname,
  "..",
  "dist",
  "installer"
);
const expectedSrcDir = path.join(distInstallerDir, "..", "..", "skills", "antfarm-workflows");
const expectedUserSkillsDir = path.join("/fake/home", ".openclaw", "skills");
const expectedDestDir = path.join(expectedUserSkillsDir, "antfarm-workflows");

// ── Tests ───────────────────────────────────────────────────────────

describe("installAntfarmSkill", () => {
  beforeEach(() => {
    mkdirCalls = [];
    accessCalls = [];
    readFileCalls = [];
    writeFileCalls = [];
    rmCalls = [];
    accessShouldThrow = false;
    readFileShouldThrow = false;
    readFileContent = "# Antfarm Workflows Skill\nThis is the skill content.";
  });

  it("returns {installed: true, path} when source exists", async () => {
    const result = await installAntfarmSkill();
    assert.equal(result.installed, true);
    assert.equal(typeof result.path, "string");
    assert.ok(result.path.includes("antfarm-workflows"));
  });

  it("returned path points to user destination directory", async () => {
    const result = await installAntfarmSkill();
    assert.equal(result.path, expectedDestDir);
  });

  it("creates user skills directory with recursive option", async () => {
    await installAntfarmSkill();
    const userSkillsMkdir = mkdirCalls.find(
      (c) => c.path === expectedUserSkillsDir
    );
    assert.ok(userSkillsMkdir, "should call mkdir for user skills dir");
    assert.deepEqual(userSkillsMkdir!.opts, { recursive: true });
  });

  it("creates destination directory with recursive option", async () => {
    await installAntfarmSkill();
    const destMkdir = mkdirCalls.find((c) => c.path === expectedDestDir);
    assert.ok(destMkdir, "should call mkdir for destination dir");
    assert.deepEqual(destMkdir!.opts, { recursive: true });
  });

  it("checks source directory access before copying", async () => {
    await installAntfarmSkill();
    assert.ok(accessCalls.length >= 1, "should call fs.access");
    assert.ok(
      accessCalls[0].includes("antfarm-workflows"),
      "should access the antfarm-workflows source dir"
    );
  });

  it("reads SKILL.md from source directory", async () => {
    await installAntfarmSkill();
    assert.ok(readFileCalls.length >= 1, "should call readFile");
    assert.ok(
      readFileCalls[0].path.endsWith("SKILL.md"),
      "should read SKILL.md"
    );
    assert.equal(readFileCalls[0].enc, "utf-8");
  });

  it("writes SKILL.md content to destination directory", async () => {
    await installAntfarmSkill();
    assert.ok(writeFileCalls.length >= 1, "should call writeFile");
    const writeCall = writeFileCalls[0];
    assert.ok(
      writeCall.path.endsWith("SKILL.md"),
      "should write SKILL.md"
    );
    assert.equal(writeCall.content, readFileContent);
    assert.equal(writeCall.enc, "utf-8");
  });

  it("copies exact SKILL.md content from source to destination", async () => {
    readFileContent = "custom skill content\nwith multiple lines";
    await installAntfarmSkill();
    assert.equal(writeFileCalls[0].content, "custom skill content\nwith multiple lines");
  });

  it("returns {installed: false} when source directory not found", async () => {
    accessShouldThrow = true;
    const result = await installAntfarmSkill();
    assert.equal(result.installed, false);
    assert.equal(typeof result.path, "string");
  });

  it("still returns path when source not found", async () => {
    accessShouldThrow = true;
    const result = await installAntfarmSkill();
    assert.equal(result.path, expectedDestDir);
  });

  it("does not write files when source not found", async () => {
    accessShouldThrow = true;
    await installAntfarmSkill();
    assert.equal(writeFileCalls.length, 0);
  });

  it("returns {installed: false} when readFile fails", async () => {
    readFileShouldThrow = true;
    const result = await installAntfarmSkill();
    assert.equal(result.installed, false);
  });

  it("still creates user skills directory even when source not found", async () => {
    accessShouldThrow = true;
    await installAntfarmSkill();
    const userSkillsMkdir = mkdirCalls.find(
      (c) => c.path === expectedUserSkillsDir
    );
    assert.ok(
      userSkillsMkdir,
      "should still call mkdir for user skills dir before checking source"
    );
  });
});

describe("uninstallAntfarmSkill", () => {
  beforeEach(() => {
    rmCalls = [];
  });

  it("calls rm on the destination directory", async () => {
    await uninstallAntfarmSkill();
    assert.ok(rmCalls.length >= 1, "should call fs.rm");
    assert.ok(
      rmCalls[0].path.includes("antfarm-workflows"),
      "should remove antfarm-workflows dir"
    );
  });

  it("uses recursive and force options", async () => {
    await uninstallAntfarmSkill();
    assert.deepEqual(rmCalls[0].opts, { recursive: true, force: true });
  });
});
