import path from "node:path";
import os from "node:os";
import type { AgentRole, StepExecutionMode } from "./types.js";

/**
 * Repo isolation policy for Antfarm step scheduling.
 *
 * v1 goal: prevent two repo-mutating coding steps from running against the
 * same shared repo checkout concurrently. We mark such steps as
 * `shared_checkout_exclusive` and leave a clean seam so that future
 * worktree-isolated modes can be added without touching call sites.
 *
 * This module is intentionally pure — no DB access — so the policy can be
 * unit-tested in isolation and reused by both the runner (when persisting
 * step rows) and the scheduler (when deciding whether a step can claim the
 * repo lock).
 */

export const SHARED_CHECKOUT_EXCLUSIVE: StepExecutionMode = "shared_checkout_exclusive";
export const NO_LOCK: StepExecutionMode = "no_lock";

/**
 * Agent roles whose steps mutate the shared repo checkout and therefore
 * require exclusive access under v1 shared-checkout semantics.
 *
 * `coding` covers developer / fixer / setup agents — anything that runs
 * write-enabled executors against the repo. Other roles (analysis,
 * verification, testing, pr, scanning) are treated as non-mutating from the
 * scheduler's perspective; they either don't touch the checkout or only
 * read from it.
 */
const REPO_MUTATING_ROLES: ReadonlySet<AgentRole> = new Set<AgentRole>([
  "coding",
]);

export function isRepoMutatingRole(role: AgentRole | undefined | null): boolean {
  if (!role) return false;
  return REPO_MUTATING_ROLES.has(role);
}

/**
 * Resolve the execution mode for a step given the role of the agent that will
 * run it.
 *
 * Repo-mutating roles (`coding`) → `shared_checkout_exclusive` under v1.
 * Everything else → `no_lock`.
 *
 * `undefined` / unknown roles are treated conservatively as non-mutating —
 * the caller is responsible for tagging roles explicitly when exclusivity
 * matters. (The runner always resolves a role via `inferRole()` before this
 * helper is invoked, so the undefined branch only matters for tests and
 * defensive callers.)
 */
export function resolveStepExecutionMode(opts: {
  role?: AgentRole | null;
}): StepExecutionMode {
  return isRepoMutatingRole(opts.role) ? SHARED_CHECKOUT_EXCLUSIVE : NO_LOCK;
}

/**
 * Normalize a raw REPO path into a stable scheduling key.
 *
 * Goals:
 *   - Two different workflow ids pointing at the same on-disk checkout
 *     produce the same `repo_key`.
 *   - Relative paths, `~`, and trailing slashes collapse to a canonical form.
 *   - Returns `null` when the input is empty/whitespace so callers can treat
 *     "no repo" as "no lock needed" rather than crashing.
 *
 * Note: we deliberately do NOT call `fs.realpathSync` here. The key must be
 * derivable without the checkout existing on disk (e.g. when a step row is
 * persisted before setup has cloned). Symlinked checkouts pointing at the
 * same underlying repo will resolve to different keys — that's acceptable
 * for v1 and can be tightened later.
 */
export function normalizeRepoKey(repoPath: string | null | undefined): string | null {
  if (repoPath == null) return null;
  const raw = String(repoPath).trim();
  if (!raw) return null;

  const expanded = expandHome(raw);
  const absolute = path.resolve(expanded);

  // `path.resolve` strips trailing slashes on POSIX but leaves `/` alone; we
  // never want a bare `/` as a repo key.
  if (absolute === "/" || absolute === "") return null;

  return absolute;
}

function expandHome(input: string): string {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

/**
 * Persisted repo metadata derived for a step at insert time.
 * Callers pass this straight into the `steps` row.
 */
export type StepRepoMetadata = {
  execution_mode: StepExecutionMode;
  repo_key: string | null;
  repo_path: string | null;
};

/**
 * One-shot helper that produces the persisted metadata for a step from its
 * role and the run's repo path. Handy at `runWorkflow` time where both are
 * already in scope.
 */
export function deriveStepRepoMetadata(opts: {
  role?: AgentRole | null;
  repoPath?: string | null;
}): StepRepoMetadata {
  const mode = resolveStepExecutionMode({ role: opts.role });
  const repoKey = normalizeRepoKey(opts.repoPath ?? null);
  const repoPath = opts.repoPath == null ? null : String(opts.repoPath).trim() || null;

  // If the step does not need a lock, we still record the repo identity for
  // operator visibility, but the scheduler will ignore it.
  return {
    execution_mode: mode,
    repo_key: mode === SHARED_CHECKOUT_EXCLUSIVE ? repoKey : repoKey,
    repo_path: repoPath,
  };
}
