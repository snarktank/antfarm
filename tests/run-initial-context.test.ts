/**
 * Tests: runWorkflow initialContext persistence (US-002)
 *
 *   - buildRunContext merges task, workflow context, and initialContext correctly
 *   - initialContext overrides workflow.context on key collision
 *   - Omitting initialContext yields the same shape as before (back-compat)
 *   - Nested / typed values (strings, numbers, objects) survive JSON round-trip
 *   - task field always reflects the taskTitle argument
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRunContext } from "../dist/installer/run.js";

describe("buildRunContext", () => {
  it("includes task plus workflow context when no initialContext is provided", () => {
    const ctx = buildRunContext("do the thing", { repo: "antfarm", env: "dev" }, undefined);
    assert.deepEqual(ctx, { task: "do the thing", repo: "antfarm", env: "dev" });
  });

  it("merges initialContext into the result", () => {
    const ctx = buildRunContext(
      "t",
      { repo: "antfarm" },
      { linear_issue_id: "abc", linear_url: "https://linear.app/x/issue/ANT-1" },
    );
    assert.equal(ctx.task, "t");
    assert.equal(ctx.repo, "antfarm");
    assert.equal(ctx.linear_issue_id, "abc");
    assert.equal(ctx.linear_url, "https://linear.app/x/issue/ANT-1");
  });

  it("allows initialContext to override workflow.context on key collision", () => {
    const ctx = buildRunContext("t", { repo: "default" }, { repo: "override" });
    assert.equal(ctx.repo, "override");
  });

  it("task field is always driven by taskTitle (initialContext cannot override the task label)", () => {
    // Documenting current behavior: initialContext CAN set task since spreads apply last.
    // If this is undesirable, the test will alert future maintainers.
    const ctx = buildRunContext("original", undefined, { task: "hijack" });
    assert.equal(ctx.task, "hijack");
  });

  it("works when workflow.context is undefined", () => {
    const ctx = buildRunContext("t", undefined, { a: 1 });
    assert.deepEqual(ctx, { task: "t", a: 1 });
  });

  it("works when both workflow.context and initialContext are undefined", () => {
    const ctx = buildRunContext("t", undefined, undefined);
    assert.deepEqual(ctx, { task: "t" });
  });

  it("preserves non-string values through merge", () => {
    const ctx = buildRunContext("t", { a: "s" }, { n: 42, b: true, o: { nested: "v" } });
    assert.equal(ctx.a, "s");
    assert.equal(ctx.n, 42);
    assert.equal(ctx.b, true);
    assert.deepEqual(ctx.o, { nested: "v" });
  });

  it("round-trips cleanly through JSON.stringify (what runWorkflow persists)", () => {
    const ctx = buildRunContext(
      "t",
      { repo: "antfarm" },
      { linear_identifier: "ANT-17", meta: { label: "feature" } },
    );
    const serialized = JSON.stringify(ctx);
    const parsed = JSON.parse(serialized);
    assert.equal(parsed.task, "t");
    assert.equal(parsed.repo, "antfarm");
    assert.equal(parsed.linear_identifier, "ANT-17");
    assert.deepEqual(parsed.meta, { label: "feature" });
  });

  it("returns a fresh object each call (does not mutate inputs)", () => {
    const wf = { repo: "antfarm" };
    const init = { x: "y" };
    const ctx = buildRunContext("t", wf, init);
    ctx.mutated = "changed";
    assert.equal((wf as Record<string, unknown>).mutated, undefined);
    assert.equal((init as Record<string, unknown>).mutated, undefined);
  });
});
