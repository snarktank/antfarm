/**
 * symlink module unit tests
 *
 * Tests ensureCliSymlink() and removeCliSymlink() for creating, updating,
 * skipping, and removing CLI symlinks. Mocks node:fs to control filesystem.
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// ── Mock state ──────────────────────────────────────────────────────

const existingPaths = new Set<string>();
const symlinkTargets = new Map<string, string>(); // linkPath -> target
const regularFiles = new Set<string>(); // paths that are regular files, not symlinks
const mkdirCalls: string[] = [];
const symlinkCalls: Array<{ target: string; path: string }> = [];
const unlinkCalls: string[] = [];
let consoleLogCalls: string[] = [];
let consoleWarnCalls: string[] = [];

// ── Module mocks ────────────────────────────────────────────────────

mock.module("node:fs", {
  namedExports: {
    existsSync: (p: string) => existingPaths.has(p),
    mkdirSync: (dir: string, _opts?: { recursive: boolean }) => {
      mkdirCalls.push(dir);
    },
    symlinkSync: (target: string, path: string) => {
      symlinkCalls.push({ target, path });
      existingPaths.add(path);
      symlinkTargets.set(path, target);
    },
    unlinkSync: (p: string) => {
      unlinkCalls.push(p);
      existingPaths.delete(p);
      symlinkTargets.delete(p);
    },
    readlinkSync: (p: string) => {
      const target = symlinkTargets.get(p);
      if (target === undefined) {
        throw new Error(`EINVAL: readlink '${p}'`);
      }
      return target;
    },
    lstatSync: (p: string) => {
      if (regularFiles.has(p)) {
        return { isSymbolicLink: () => false };
      }
      if (symlinkTargets.has(p)) {
        return { isSymbolicLink: () => true };
      }
      throw new Error(`ENOENT: lstat '${p}'`);
    },
  },
});

mock.module("node:url", {
  namedExports: {
    fileURLToPath: (_url: string) => "/fake/dist/installer/symlink.js",
  },
});

// Import after mocks
const { ensureCliSymlink, removeCliSymlink } = await import(
  "../dist/installer/symlink.js"
);

// ── Tests ───────────────────────────────────────────────────────────

describe("ensureCliSymlink", () => {
  beforeEach(() => {
    existingPaths.clear();
    symlinkTargets.clear();
    regularFiles.clear();
    mkdirCalls.length = 0;
    symlinkCalls.length = 0;
    unlinkCalls.length = 0;
    consoleLogCalls = [];
    consoleWarnCalls = [];
    mock.method(console, "log", (...args: unknown[]) => {
      consoleLogCalls.push(args.map(String).join(" "));
    });
    mock.method(console, "warn", (...args: unknown[]) => {
      consoleWarnCalls.push(args.map(String).join(" "));
    });
    process.env.HOME = "/home/testuser";
  });

  it("creates a symlink at the expected path", () => {
    ensureCliSymlink();

    assert.equal(mkdirCalls.length, 1);
    assert.equal(mkdirCalls[0], "/home/testuser/.local/bin");
    assert.equal(symlinkCalls.length, 1);
    assert.equal(symlinkCalls[0].path, "/home/testuser/.local/bin/antfarm");
    // Target should resolve to dist/cli/cli.js relative to the mocked path
    assert.ok(
      symlinkCalls[0].target.includes("cli.js"),
      `expected target to include cli.js, got: ${symlinkCalls[0].target}`
    );
  });

  it("skips if symlink already points to the correct target", () => {
    const expectedTarget = "/fake/dist/cli/cli.js";
    const linkPath = "/home/testuser/.local/bin/antfarm";
    existingPaths.add(linkPath);
    symlinkTargets.set(linkPath, expectedTarget);

    ensureCliSymlink();

    assert.equal(symlinkCalls.length, 0, "should not create a new symlink");
    assert.equal(unlinkCalls.length, 0, "should not unlink");
  });

  it("updates symlink if it points to a stale target", () => {
    const linkPath = "/home/testuser/.local/bin/antfarm";
    existingPaths.add(linkPath);
    symlinkTargets.set(linkPath, "/old/path/cli.js");

    ensureCliSymlink();

    assert.equal(unlinkCalls.length, 1, "should remove stale symlink");
    assert.equal(unlinkCalls[0], linkPath);
    assert.equal(symlinkCalls.length, 1, "should create new symlink");
    assert.equal(symlinkCalls[0].path, linkPath);
  });

  it("warns and skips if path exists as a regular file", () => {
    const linkPath = "/home/testuser/.local/bin/antfarm";
    existingPaths.add(linkPath);
    regularFiles.add(linkPath);

    ensureCliSymlink();

    assert.equal(symlinkCalls.length, 0, "should not create symlink");
    assert.equal(unlinkCalls.length, 0, "should not unlink");
    assert.ok(
      consoleWarnCalls.some((msg) => msg.includes("not a symlink")),
      "should warn about existing non-symlink file"
    );
  });

  it("does nothing when HOME is not set", () => {
    delete process.env.HOME;

    ensureCliSymlink();

    assert.equal(mkdirCalls.length, 0);
    assert.equal(symlinkCalls.length, 0);
  });
});

describe("removeCliSymlink", () => {
  beforeEach(() => {
    existingPaths.clear();
    symlinkTargets.clear();
    regularFiles.clear();
    mkdirCalls.length = 0;
    symlinkCalls.length = 0;
    unlinkCalls.length = 0;
    consoleLogCalls = [];
    consoleWarnCalls = [];
    mock.method(console, "log", (...args: unknown[]) => {
      consoleLogCalls.push(args.map(String).join(" "));
    });
    mock.method(console, "warn", (...args: unknown[]) => {
      consoleWarnCalls.push(args.map(String).join(" "));
    });
    process.env.HOME = "/home/testuser";
  });

  it("removes an existing symlink", () => {
    const linkPath = "/home/testuser/.local/bin/antfarm";
    existingPaths.add(linkPath);

    removeCliSymlink();

    assert.equal(unlinkCalls.length, 1);
    assert.equal(unlinkCalls[0], linkPath);
    assert.ok(
      consoleLogCalls.some((msg) => msg.includes("Removed symlink")),
      "should log removal confirmation"
    );
  });

  it("handles missing symlink gracefully (no throw)", () => {
    // linkPath does not exist
    assert.doesNotThrow(() => {
      removeCliSymlink();
    });

    assert.equal(unlinkCalls.length, 0, "should not attempt to unlink");
  });

  it("does nothing when HOME is not set", () => {
    delete process.env.HOME;

    assert.doesNotThrow(() => {
      removeCliSymlink();
    });

    assert.equal(unlinkCalls.length, 0);
  });
});
