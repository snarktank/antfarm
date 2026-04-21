/**
 * Tests: Linear integration config loader
 *
 * Covers US-003:
 *   - Reads ~/.openclaw/antfarm/linear.json and LINEAR_API_TOKEN
 *   - Enforces MVP scope (one team, feature-dev, one readiness selector)
 *   - Requires running/done/failed state ids
 *   - Produces clear, actionable errors for each failure mode
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_LINEAR_CONFIG_PATH,
  LinearConfigError,
  MVP_WORKFLOW_ID,
  loadLinearConfig,
  validateLinearConfig,
} from "../dist/integrations/linear/config.js";

function tmpConfig(blob: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-linear-cfg-"));
  const p = path.join(dir, "linear.json");
  fs.writeFileSync(p, JSON.stringify(blob), "utf-8");
  return p;
}

function writeRaw(raw: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-linear-cfg-"));
  const p = path.join(dir, "linear.json");
  fs.writeFileSync(p, raw, "utf-8");
  return p;
}

const validBlob = {
  teamId: "team_abc",
  workflowId: "feature-dev",
  defaultRepoPath: "/Users/me/repo",
  states: {
    readyStateId: "state_ready",
    runningStateId: "state_running",
    doneStateId: "state_done",
    failedStateId: "state_failed",
  },
};

describe("linear config: defaults and exports", () => {
  it("DEFAULT_LINEAR_CONFIG_PATH points at ~/.openclaw/antfarm/linear.json", () => {
    assert.equal(
      DEFAULT_LINEAR_CONFIG_PATH,
      path.join(os.homedir(), ".openclaw", "antfarm", "linear.json"),
    );
  });

  it("MVP_WORKFLOW_ID is feature-dev", () => {
    assert.equal(MVP_WORKFLOW_ID, "feature-dev");
  });
});

describe("loadLinearConfig: happy path", () => {
  it("loads and validates a minimal valid config using state-based readiness", () => {
    const configPath = tmpConfig(validBlob);
    const loaded = loadLinearConfig({
      configPath,
      env: { LINEAR_API_TOKEN: "lin_test_token" },
    });
    assert.equal(loaded.apiToken, "lin_test_token");
    assert.equal(loaded.path, configPath);
    assert.equal(loaded.config.teamId, "team_abc");
    assert.equal(loaded.config.workflowId, "feature-dev");
    assert.equal(loaded.config.defaultRepoPath, "/Users/me/repo");
    assert.equal(loaded.config.states.readyStateId, "state_ready");
    assert.equal(loaded.config.states.readyLabelId, undefined);
    assert.equal(loaded.config.states.runningStateId, "state_running");
    assert.equal(loaded.config.states.doneStateId, "state_done");
    assert.equal(loaded.config.states.failedStateId, "state_failed");
  });

  it("accepts label-based readiness selector", () => {
    const blob = {
      ...validBlob,
      states: {
        readyLabelId: "label_ready",
        runningStateId: "state_running",
        doneStateId: "state_done",
        failedStateId: "state_failed",
      },
    };
    const configPath = tmpConfig(blob);
    const loaded = loadLinearConfig({
      configPath,
      env: { LINEAR_API_TOKEN: "tok" },
    });
    assert.equal(loaded.config.states.readyStateId, undefined);
    assert.equal(loaded.config.states.readyLabelId, "label_ready");
  });

  it("apiToken option overrides env", () => {
    const configPath = tmpConfig(validBlob);
    const loaded = loadLinearConfig({
      configPath,
      apiToken: "explicit",
      env: { LINEAR_API_TOKEN: "from_env" },
    });
    assert.equal(loaded.apiToken, "explicit");
  });

  it("trims whitespace around the API token", () => {
    const configPath = tmpConfig(validBlob);
    const loaded = loadLinearConfig({
      configPath,
      env: { LINEAR_API_TOKEN: "  padded  " },
    });
    assert.equal(loaded.apiToken, "padded");
  });
});

describe("loadLinearConfig: error surfaces", () => {
  it("throws when LINEAR_API_TOKEN is missing", () => {
    const configPath = tmpConfig(validBlob);
    assert.throws(
      () => loadLinearConfig({ configPath, env: {} }),
      (err) =>
        err instanceof LinearConfigError &&
        /LINEAR_API_TOKEN/.test(err.message),
    );
  });

  it("throws when LINEAR_API_TOKEN is blank", () => {
    const configPath = tmpConfig(validBlob);
    assert.throws(
      () => loadLinearConfig({ configPath, env: { LINEAR_API_TOKEN: "  " } }),
      (err) =>
        err instanceof LinearConfigError &&
        /LINEAR_API_TOKEN/.test(err.message),
    );
  });

  it("throws with install hint when config file is missing", () => {
    const missing = path.join(
      os.tmpdir(),
      `antfarm-linear-missing-${Date.now()}.json`,
    );
    assert.throws(
      () =>
        loadLinearConfig({
          configPath: missing,
          env: { LINEAR_API_TOKEN: "tok" },
        }),
      (err) =>
        err instanceof LinearConfigError &&
        err.message.includes(missing) &&
        /antfarm linear install/.test(err.message),
    );
  });

  it("throws on invalid JSON", () => {
    const configPath = writeRaw("{ not json");
    assert.throws(
      () =>
        loadLinearConfig({
          configPath,
          env: { LINEAR_API_TOKEN: "tok" },
        }),
      (err) =>
        err instanceof LinearConfigError &&
        /not valid JSON/.test(err.message),
    );
  });
});

describe("validateLinearConfig: field-level validation", () => {
  it("rejects non-object input", () => {
    assert.throws(
      () => validateLinearConfig(null),
      (err) =>
        err instanceof LinearConfigError && /must be a JSON object/.test(err.message),
    );
    assert.throws(
      () => validateLinearConfig([]),
      (err) =>
        err instanceof LinearConfigError && /must be a JSON object/.test(err.message),
    );
  });

  it("rejects missing teamId", () => {
    const { teamId: _omit, ...rest } = validBlob;
    assert.throws(
      () => validateLinearConfig(rest),
      (err) =>
        err instanceof LinearConfigError && /teamId/.test(err.message),
    );
  });

  it("rejects empty-string teamId", () => {
    assert.throws(
      () => validateLinearConfig({ ...validBlob, teamId: "   " }),
      (err) =>
        err instanceof LinearConfigError && /teamId/.test(err.message),
    );
  });

  it("rejects workflowId other than feature-dev", () => {
    assert.throws(
      () =>
        validateLinearConfig({ ...validBlob, workflowId: "custom-wf" }),
      (err) =>
        err instanceof LinearConfigError &&
        /feature-dev/.test(err.message) &&
        /custom-wf/.test(err.message),
    );
  });

  it("rejects missing defaultRepoPath", () => {
    const { defaultRepoPath: _omit, ...rest } = validBlob;
    assert.throws(
      () => validateLinearConfig(rest),
      (err) =>
        err instanceof LinearConfigError &&
        /defaultRepoPath/.test(err.message),
    );
  });

  it("rejects missing states object", () => {
    const { states: _omit, ...rest } = validBlob;
    assert.throws(
      () => validateLinearConfig(rest),
      (err) =>
        err instanceof LinearConfigError && /"states"/.test(err.message),
    );
  });

  it("rejects when no readiness selector is set", () => {
    const blob = {
      ...validBlob,
      states: {
        runningStateId: "r",
        doneStateId: "d",
        failedStateId: "f",
      },
    };
    assert.throws(
      () => validateLinearConfig(blob),
      (err) =>
        err instanceof LinearConfigError &&
        /readyStateId/.test(err.message) &&
        /readyLabelId/.test(err.message),
    );
  });

  it("rejects when both readiness selectors are set", () => {
    const blob = {
      ...validBlob,
      states: {
        readyStateId: "a",
        readyLabelId: "b",
        runningStateId: "r",
        doneStateId: "d",
        failedStateId: "f",
      },
    };
    assert.throws(
      () => validateLinearConfig(blob),
      (err) =>
        err instanceof LinearConfigError &&
        /exactly one/.test(err.message) &&
        /not both/.test(err.message),
    );
  });

  it("rejects missing runningStateId", () => {
    const blob = {
      ...validBlob,
      states: {
        readyStateId: "x",
        doneStateId: "d",
        failedStateId: "f",
      },
    };
    assert.throws(
      () => validateLinearConfig(blob),
      (err) =>
        err instanceof LinearConfigError &&
        /runningStateId/.test(err.message),
    );
  });

  it("rejects missing doneStateId", () => {
    const blob = {
      ...validBlob,
      states: {
        readyStateId: "x",
        runningStateId: "r",
        failedStateId: "f",
      },
    };
    assert.throws(
      () => validateLinearConfig(blob),
      (err) =>
        err instanceof LinearConfigError && /doneStateId/.test(err.message),
    );
  });

  it("rejects missing failedStateId", () => {
    const blob = {
      ...validBlob,
      states: {
        readyStateId: "x",
        runningStateId: "r",
        doneStateId: "d",
      },
    };
    assert.throws(
      () => validateLinearConfig(blob),
      (err) =>
        err instanceof LinearConfigError &&
        /failedStateId/.test(err.message),
    );
  });

  it("rejects non-string state id values", () => {
    const blob = {
      ...validBlob,
      states: {
        readyStateId: "x",
        runningStateId: 42,
        doneStateId: "d",
        failedStateId: "f",
      },
    };
    assert.throws(
      () => validateLinearConfig(blob),
      (err) =>
        err instanceof LinearConfigError &&
        /runningStateId/.test(err.message),
    );
  });
});
