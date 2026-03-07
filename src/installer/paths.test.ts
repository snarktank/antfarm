import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import path from "node:path";
import {
  resolveAntfarmHome,
  resolveOpenClawConfigPath,
  resolveOpenClawSkillsDir,
  resolveOpenClawStateDir,
  resolveOpenClawWorkspaceSkillsDir
} from "./paths.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("paths", () => {
  it("prefers ANTFARM_HOME when set", () => {
    process.env.ANTFARM_HOME = "/tmp/antfarm-home";
    process.env.OPENCLAW_STATE_DIR = "/tmp/openclaw-state";
    assert.equal(resolveAntfarmHome(), "/tmp/antfarm-home");
  });

  it("falls back to OPENCLAW_STATE_DIR for antfarm root", () => {
    delete process.env.ANTFARM_HOME;
    process.env.OPENCLAW_STATE_DIR = "/tmp/openclaw-state";
    assert.equal(resolveAntfarmHome(), "/tmp/openclaw-state/antfarm");
  });

  it("uses OPENCLAW_CONFIG_PATH when provided", () => {
    process.env.OPENCLAW_CONFIG_PATH = "/tmp/custom-openclaw.json";
    assert.equal(resolveOpenClawConfigPath(), "/tmp/custom-openclaw.json");
  });

  it("derives skills paths from OPENCLAW_STATE_DIR", () => {
    process.env.OPENCLAW_STATE_DIR = "/tmp/openclaw-state";
    assert.equal(resolveOpenClawSkillsDir(), path.join("/tmp/openclaw-state", "skills"));
    assert.equal(resolveOpenClawWorkspaceSkillsDir(), path.join("/tmp/openclaw-state", "workspace", "skills"));
  });

  it("returns default state dir when OPENCLAW_STATE_DIR is unset", () => {
    delete process.env.OPENCLAW_STATE_DIR;
    const stateDir = resolveOpenClawStateDir();
    assert.ok(stateDir.endsWith(path.join(".openclaw")));
  });
});
