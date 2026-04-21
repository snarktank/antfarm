/**
 * Tests: repo-isolation policy helpers
 *
 * Covers US-001:
 *   - resolveStepExecutionMode() returns `shared_checkout_exclusive` for
 *     repo-mutating (coding) roles and `no_lock` for everything else
 *   - normalizeRepoKey() canonicalizes repo paths so different representations
 *     of the same checkout collapse to one scheduling key
 *   - deriveStepRepoMetadata() glues role + path into a persist-ready record
 *
 * These helpers are pure (no DB, no fs), so we import them directly from dist/
 * to mirror the existing test-import convention.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import {
  resolveStepExecutionMode,
  normalizeRepoKey,
  deriveStepRepoMetadata,
  isRepoMutatingRole,
  SHARED_CHECKOUT_EXCLUSIVE,
  NO_LOCK,
} from "../dist/installer/repo-isolation.js";
import type { AgentRole } from "../dist/installer/types.js";

describe("resolveStepExecutionMode()", () => {
  it("returns shared_checkout_exclusive for coding roles", () => {
    assert.equal(
      resolveStepExecutionMode({ role: "coding" }),
      SHARED_CHECKOUT_EXCLUSIVE,
    );
  });

  it("returns no_lock for non-mutating roles", () => {
    const nonMutating: AgentRole[] = [
      "analysis",
      "verification",
      "testing",
      "pr",
      "scanning",
    ];
    for (const role of nonMutating) {
      assert.equal(
        resolveStepExecutionMode({ role }),
        NO_LOCK,
        `role ${role} should resolve to no_lock`,
      );
    }
  });

  it("treats missing role as non-mutating (conservative default)", () => {
    assert.equal(resolveStepExecutionMode({}), NO_LOCK);
    assert.equal(resolveStepExecutionMode({ role: null }), NO_LOCK);
    assert.equal(resolveStepExecutionMode({ role: undefined }), NO_LOCK);
  });

  it("isRepoMutatingRole() matches the resolved mode", () => {
    assert.equal(isRepoMutatingRole("coding"), true);
    assert.equal(isRepoMutatingRole("analysis"), false);
    assert.equal(isRepoMutatingRole(undefined), false);
    assert.equal(isRepoMutatingRole(null), false);
  });
});

describe("normalizeRepoKey()", () => {
  it("returns null for empty / whitespace / nullish input", () => {
    assert.equal(normalizeRepoKey(null), null);
    assert.equal(normalizeRepoKey(undefined), null);
    assert.equal(normalizeRepoKey(""), null);
    assert.equal(normalizeRepoKey("   "), null);
  });

  it("returns null for a bare root path (no meaningful repo)", () => {
    assert.equal(normalizeRepoKey("/"), null);
  });

  it("collapses trailing slashes to a single canonical form", () => {
    const a = normalizeRepoKey("/tmp/antfarm-repo");
    const b = normalizeRepoKey("/tmp/antfarm-repo/");
    const c = normalizeRepoKey("/tmp/antfarm-repo///");
    assert.equal(a, "/tmp/antfarm-repo");
    assert.equal(b, a);
    assert.equal(c, a);
  });

  it("resolves relative paths against the process cwd", () => {
    const rel = "./some-repo";
    const normalized = normalizeRepoKey(rel);
    assert.equal(normalized, path.resolve(rel));
    assert.ok(path.isAbsolute(normalized!), "normalized key must be absolute");
  });

  it("collapses `..` segments so equivalent paths share a key", () => {
    const a = normalizeRepoKey("/tmp/antfarm/../antfarm/repo");
    const b = normalizeRepoKey("/tmp/antfarm/repo");
    assert.equal(a, b);
  });

  it("expands `~` and `~/…` using the user's home directory", () => {
    const home = os.homedir();
    assert.equal(normalizeRepoKey("~"), home);
    assert.equal(normalizeRepoKey("~/repos/app"), path.join(home, "repos/app"));
  });

  it("different workflow ids pointing at the same checkout resolve to the same key", () => {
    const keyA = normalizeRepoKey("/Users/dev/workspace/feature-dev-app");
    const keyB = normalizeRepoKey("/Users/dev/workspace/feature-dev-app/");
    const keyC = normalizeRepoKey("/Users/dev/workspace/../workspace/feature-dev-app");
    assert.equal(keyA, keyB);
    assert.equal(keyA, keyC);
  });

  it("distinct checkouts resolve to distinct keys", () => {
    const a = normalizeRepoKey("/repos/app-one");
    const b = normalizeRepoKey("/repos/app-two");
    assert.notEqual(a, b);
  });
});

describe("deriveStepRepoMetadata()", () => {
  it("produces exclusive mode + normalized key for coding steps", () => {
    const meta = deriveStepRepoMetadata({
      role: "coding",
      repoPath: "/repos/app/",
    });
    assert.equal(meta.execution_mode, SHARED_CHECKOUT_EXCLUSIVE);
    assert.equal(meta.repo_key, "/repos/app");
    assert.equal(meta.repo_path, "/repos/app/");
  });

  it("produces no-lock mode for analysis steps (but still records identity)", () => {
    const meta = deriveStepRepoMetadata({
      role: "analysis",
      repoPath: "/repos/app",
    });
    assert.equal(meta.execution_mode, NO_LOCK);
    // We still persist repo identity for operator visibility even when no
    // lock is taken.
    assert.equal(meta.repo_key, "/repos/app");
    assert.equal(meta.repo_path, "/repos/app");
  });

  it("handles missing repo path by nulling out key + path", () => {
    const meta = deriveStepRepoMetadata({ role: "coding", repoPath: null });
    assert.equal(meta.execution_mode, SHARED_CHECKOUT_EXCLUSIVE);
    assert.equal(meta.repo_key, null);
    assert.equal(meta.repo_path, null);
  });

  it("handles missing role by defaulting to no_lock", () => {
    const meta = deriveStepRepoMetadata({ repoPath: "/repos/app" });
    assert.equal(meta.execution_mode, NO_LOCK);
    assert.equal(meta.repo_key, "/repos/app");
  });

  it("trims whitespace in repo path but preserves the raw-ish value", () => {
    const meta = deriveStepRepoMetadata({
      role: "coding",
      repoPath: "   ",
    });
    assert.equal(meta.repo_key, null);
    assert.equal(meta.repo_path, null);
  });
});
