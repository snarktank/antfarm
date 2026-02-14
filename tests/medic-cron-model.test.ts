import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

describe("medic-cron configurable model", () => {
  let getMedicModel: typeof import("../dist/medic/medic-cron.js").getMedicModel;
  const originalEnv = process.env.ANTFARM_MEDIC_MODEL;

  beforeEach(async () => {
    // Clean env before each test
    delete process.env.ANTFARM_MEDIC_MODEL;
    // Re-import to get fresh module (the function reads env at call time, not import time)
    const mod = await import("../dist/medic/medic-cron.js");
    getMedicModel = mod.getMedicModel;
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.ANTFARM_MEDIC_MODEL = originalEnv;
    } else {
      delete process.env.ANTFARM_MEDIC_MODEL;
    }
  });

  it("defaults to claude-sonnet-4-20250514 when env var not set", () => {
    delete process.env.ANTFARM_MEDIC_MODEL;
    const model = getMedicModel();
    assert.equal(model, "claude-sonnet-4-20250514");
  });

  it("defaults when env var is empty string", () => {
    process.env.ANTFARM_MEDIC_MODEL = "";
    const model = getMedicModel();
    assert.equal(model, "claude-sonnet-4-20250514");
  });

  it("reads ANTFARM_MEDIC_MODEL env var when set", () => {
    process.env.ANTFARM_MEDIC_MODEL = "anthropic/claude-opus-4-6";
    const model = getMedicModel();
    assert.equal(model, "anthropic/claude-opus-4-6");
  });

  it("accepts kimi-k2 model identifier", () => {
    process.env.ANTFARM_MEDIC_MODEL = "kimi-k2";
    const model = getMedicModel();
    assert.equal(model, "kimi-k2");
  });

  it("accepts kimi-code model identifier", () => {
    process.env.ANTFARM_MEDIC_MODEL = "kimi-code";
    const model = getMedicModel();
    assert.equal(model, "kimi-code");
  });

  it("accepts kimi-for-coding model identifier", () => {
    process.env.ANTFARM_MEDIC_MODEL = "kimi-for-coding";
    const model = getMedicModel();
    assert.equal(model, "kimi-for-coding");
  });

  it("returns the exact value from env var without modification", () => {
    process.env.ANTFARM_MEDIC_MODEL = "kimi-custom-model-v2";
    const model = getMedicModel();
    assert.equal(model, "kimi-custom-model-v2");
  });
});
