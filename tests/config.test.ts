/**
 * Config module unit tests
 *
 * Tests loadConfig() with valid files, missing files, malformed JSON,
 * default value fallbacks, and env overrides.
 *
 * Approach: Mock node:fs and node:os to control what loadConfig() reads.
 * Mock ../dist/lib/logger.js to suppress log output.
 */

import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

// ── FS mock state ───────────────────────────────────────────────────

const mockFiles = new Map<string, string>();
const FAKE_HOME = "/fake/home";
const CONFIG_PATH = path.join(FAKE_HOME, ".openclaw", "antfarm.json");

// ── Module mocks ────────────────────────────────────────────────────

mock.module("node:os", {
  defaultExport: {
    homedir: () => FAKE_HOME,
  },
});

mock.module("node:fs", {
  defaultExport: {
    readFileSync: (filePath: string, _encoding: string) => {
      const content = mockFiles.get(filePath);
      if (content === undefined) {
        const err = new Error(
          `ENOENT: no such file or directory, open '${filePath}'`
        ) as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
      return content;
    },
    writeFileSync: (filePath: string, data: string) => {
      mockFiles.set(filePath, data);
    },
    mkdirSync: () => {},
  },
});

mock.module("../dist/lib/logger.js", {
  namedExports: {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  },
});

// Import after mocks are set up
const { loadConfig, getDefaultConfig, getConfigPath } = await import(
  "../dist/config.js"
);

// ── Env override cleanup helper ─────────────────────────────────────

const ENV_KEYS = [
  "ANTFARM_POLLING_INTERVAL_MS",
  "ANTFARM_POLLING_TIMEOUT_SECONDS",
  "ANTFARM_WORKER_TIMEOUT_SECONDS",
  "ANTFARM_WORKER_HEARTBEAT_ENABLED",
  "ANTFARM_CONCURRENCY_OPUS",
  "ANTFARM_CONCURRENCY_SONNET",
  "ANTFARM_CONCURRENCY_HAIKU",
  "ANTFARM_RESOURCE_CPU_QUOTA",
  "ANTFARM_RESOURCE_MEMORY_MAX",
  "ANTFARM_MONITORING_LAG_WARNING_MS",
  "ANTFARM_MONITORING_LAG_CRITICAL_MS",
];

const savedEnv: Record<string, string | undefined> = {};

// ── Tests ───────────────────────────────────────────────────────────

describe("Config", () => {
  beforeEach(() => {
    mockFiles.clear();
    // Save and clear env vars that could affect tests
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore env vars
    for (const key of ENV_KEYS) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  describe("getDefaultConfig", () => {
    it("returns correct default concurrency limits", () => {
      const defaults = getDefaultConfig();
      assert.equal(defaults.concurrency.opus, 2);
      assert.equal(defaults.concurrency.sonnet, 4);
      assert.equal(defaults.concurrency.haiku, 8);
    });

    it("returns correct default polling settings", () => {
      const defaults = getDefaultConfig();
      assert.equal(defaults.polling.intervalMs, 300_000);
      assert.equal(defaults.polling.timeoutSeconds, 120);
    });

    it("returns correct default worker settings", () => {
      const defaults = getDefaultConfig();
      assert.equal(defaults.worker.timeoutSeconds, 1800);
      assert.equal(defaults.worker.heartbeatEnabled, true);
    });
  });

  describe("loadConfig — successful loading", () => {
    it("loads and merges config from antfarm.json", () => {
      const partialConfig = {
        concurrency: { opus: 5 },
      };
      mockFiles.set(CONFIG_PATH, JSON.stringify(partialConfig));

      const config = loadConfig();
      // Overridden value
      assert.equal(config.concurrency.opus, 5);
      // Defaults preserved for non-overridden fields
      assert.equal(config.concurrency.sonnet, 4);
      assert.equal(config.concurrency.haiku, 8);
    });

    it("merges multiple sections from config file", () => {
      const partialConfig = {
        polling: { intervalMs: 60_000 },
        worker: { timeoutSeconds: 3600 },
        concurrency: { haiku: 16 },
      };
      mockFiles.set(CONFIG_PATH, JSON.stringify(partialConfig));

      const config = loadConfig();
      assert.equal(config.polling.intervalMs, 60_000);
      assert.equal(config.polling.timeoutSeconds, 120); // default preserved
      assert.equal(config.worker.timeoutSeconds, 3600);
      assert.equal(config.worker.heartbeatEnabled, true); // default preserved
      assert.equal(config.concurrency.haiku, 16);
      assert.equal(config.concurrency.opus, 2); // default preserved
    });
  });

  describe("loadConfig — missing file fallback", () => {
    it("returns defaults when antfarm.json does not exist", () => {
      // mockFiles is empty — no config file
      const config = loadConfig();
      const defaults = getDefaultConfig();
      assert.deepEqual(config, defaults);
    });
  });

  describe("loadConfig — malformed JSON", () => {
    it("returns defaults when antfarm.json contains invalid JSON", () => {
      mockFiles.set(CONFIG_PATH, "{ not valid json !!!");

      const config = loadConfig();
      const defaults = getDefaultConfig();
      assert.deepEqual(config, defaults);
    });

    it("returns defaults when antfarm.json is empty", () => {
      mockFiles.set(CONFIG_PATH, "");

      const config = loadConfig();
      const defaults = getDefaultConfig();
      assert.deepEqual(config, defaults);
    });
  });

  describe("loadConfig — environment variable overrides", () => {
    it("overrides concurrency from env vars", () => {
      process.env.ANTFARM_CONCURRENCY_OPUS = "10";
      process.env.ANTFARM_CONCURRENCY_SONNET = "20";
      process.env.ANTFARM_CONCURRENCY_HAIKU = "30";

      const config = loadConfig();
      assert.equal(config.concurrency.opus, 10);
      assert.equal(config.concurrency.sonnet, 20);
      assert.equal(config.concurrency.haiku, 30);
    });

    it("env overrides take precedence over file values", () => {
      const partialConfig = { concurrency: { opus: 5 } };
      mockFiles.set(CONFIG_PATH, JSON.stringify(partialConfig));
      process.env.ANTFARM_CONCURRENCY_OPUS = "99";

      const config = loadConfig();
      assert.equal(config.concurrency.opus, 99);
    });
  });
});
