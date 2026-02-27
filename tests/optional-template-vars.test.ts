/**
 * Regression test: optional template variables like {{verify_feedback}} must
 * be defaulted to empty string so findMissingTemplateKeys doesn't reject steps
 * on their first run (before any verify pass has populated the var).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultOptionalTemplateVars, resolveTemplate } from "../dist/installer/step-ops.js";

describe("defaultOptionalTemplateVars", () => {

  it("sets verify_feedback to empty string when missing", () => {
    const ctx: Record<string, string> = { task: "fix bug" };
    defaultOptionalTemplateVars(ctx);
    assert.equal(ctx["verify_feedback"], "");
  });

  it("preserves existing verify_feedback value", () => {
    const ctx: Record<string, string> = { verify_feedback: "needs error handling" };
    defaultOptionalTemplateVars(ctx);
    assert.equal(ctx["verify_feedback"], "needs error handling");
  });

  it("allows resolveTemplate to resolve {{verify_feedback}} after defaults applied", () => {
    const ctx: Record<string, string> = { task: "fix bug" };
    defaultOptionalTemplateVars(ctx);
    const result = resolveTemplate("Do {{task}}. Feedback: {{verify_feedback}}", ctx);
    assert.equal(result, "Do fix bug. Feedback: ");
  });
});
