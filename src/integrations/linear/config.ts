/**
 * Linear integration config loader.
 *
 * Reads ~/.openclaw/antfarm/linear.json and LINEAR_API_TOKEN, validates
 * them against the MVP scope (one team, feature-dev workflow, exactly
 * one readiness selector, full state-map writeback), and returns a
 * typed result.
 *
 * Invalid config throws LinearConfigError with an actionable message.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { LinearConfig, LinearStateMap } from "./types.js";

export const MVP_WORKFLOW_ID = "feature-dev";

export const DEFAULT_LINEAR_CONFIG_PATH = path.join(
  os.homedir(),
  ".openclaw",
  "antfarm",
  "linear.json",
);

export class LinearConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinearConfigError";
  }
}

export interface LoadLinearConfigOptions {
  /** Override the config file path. Defaults to ~/.openclaw/antfarm/linear.json. */
  configPath?: string;
  /** Override the API token. Defaults to process.env.LINEAR_API_TOKEN. */
  apiToken?: string;
  /** Override env lookup (used by tests). */
  env?: NodeJS.ProcessEnv;
}

export interface LoadedLinearConfig {
  config: LinearConfig;
  apiToken: string;
  path: string;
}

/**
 * Load, parse, and validate the Linear integration config.
 *
 * Precedence: explicit options override env and filesystem.
 * Throws {@link LinearConfigError} with a clear message on any problem.
 */
export function loadLinearConfig(
  options: LoadLinearConfigOptions = {},
): LoadedLinearConfig {
  const env = options.env ?? process.env;
  const configPath = options.configPath ?? DEFAULT_LINEAR_CONFIG_PATH;

  const apiToken = (options.apiToken ?? env.LINEAR_API_TOKEN ?? "").trim();
  if (!apiToken) {
    throw new LinearConfigError(
      "Missing LINEAR_API_TOKEN environment variable. " +
        "Set it to a Linear personal API key to enable the integration.",
    );
  }

  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new LinearConfigError(
        `Linear config not found at ${configPath}. ` +
          `Create it with: antfarm linear install`,
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new LinearConfigError(
      `Failed to read Linear config at ${configPath}: ${message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LinearConfigError(
      `Linear config at ${configPath} is not valid JSON: ${message}`,
    );
  }

  const config = validateLinearConfig(parsed, configPath);
  return { config, apiToken, path: configPath };
}

/**
 * Validate a parsed config blob against MVP rules and return a typed
 * {@link LinearConfig}. Exported so tests and the installer can run
 * validation without touching the filesystem.
 */
export function validateLinearConfig(
  input: unknown,
  sourceLabel = "linear.json",
): LinearConfig {
  if (!isRecord(input)) {
    throw new LinearConfigError(
      `${sourceLabel} must be a JSON object (got ${describe(input)}).`,
    );
  }

  const teamId = requireString(input.teamId, "teamId", sourceLabel);
  const workflowId = requireString(input.workflowId, "workflowId", sourceLabel);
  if (workflowId !== MVP_WORKFLOW_ID) {
    throw new LinearConfigError(
      `${sourceLabel}: workflowId must be "${MVP_WORKFLOW_ID}" for the ` +
        `Linear MVP (got "${workflowId}").`,
    );
  }

  const defaultRepoPath = requireString(
    input.defaultRepoPath,
    "defaultRepoPath",
    sourceLabel,
  );

  if (!isRecord(input.states)) {
    throw new LinearConfigError(
      `${sourceLabel}: "states" must be an object mapping Linear workflow ` +
        `state ids for readiness, running, done, and failed transitions.`,
    );
  }
  const states = validateStateMap(input.states, sourceLabel);

  return {
    teamId,
    workflowId,
    defaultRepoPath,
    states,
  };
}

function validateStateMap(
  input: Record<string, unknown>,
  sourceLabel: string,
): LinearStateMap {
  const runningStateId = requireString(
    input.runningStateId,
    "states.runningStateId",
    sourceLabel,
  );
  const doneStateId = requireString(
    input.doneStateId,
    "states.doneStateId",
    sourceLabel,
  );
  const failedStateId = requireString(
    input.failedStateId,
    "states.failedStateId",
    sourceLabel,
  );

  const readyStateId = optionalString(
    input.readyStateId,
    "states.readyStateId",
    sourceLabel,
  );
  const readyLabelId = optionalString(
    input.readyLabelId,
    "states.readyLabelId",
    sourceLabel,
  );

  if (!readyStateId && !readyLabelId) {
    throw new LinearConfigError(
      `${sourceLabel}: configure exactly one readiness selector — either ` +
        `"states.readyStateId" (a Linear workflow state id) or ` +
        `"states.readyLabelId" (a Linear label id).`,
    );
  }
  if (readyStateId && readyLabelId) {
    throw new LinearConfigError(
      `${sourceLabel}: set exactly one of "states.readyStateId" or ` +
        `"states.readyLabelId" — not both.`,
    );
  }

  return {
    readyStateId,
    readyLabelId,
    runningStateId,
    doneStateId,
    failedStateId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

function requireString(
  value: unknown,
  field: string,
  sourceLabel: string,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new LinearConfigError(
      `${sourceLabel}: "${field}" is required and must be a non-empty string ` +
        `(got ${describe(value)}).`,
    );
  }
  return value;
}

function optionalString(
  value: unknown,
  field: string,
  sourceLabel: string,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new LinearConfigError(
      `${sourceLabel}: "${field}" must be a non-empty string when set ` +
        `(got ${describe(value)}).`,
    );
  }
  return value;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
