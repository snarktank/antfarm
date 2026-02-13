import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Regression test for https://github.com/snarktank/antfarm/issues/116
 *
 * When OpenClaw gateway is configured with auth.mode "password" (instead of
 * "token"), antfarm's cron setup was sending NO Authorization header at all,
 * causing 401 Unauthorized. The fix reads the auth mode and password from the
 * config and sends `Bearer <password>` in that mode.
 */
describe("gateway-api password auth mode (#116)", () => {
  const configDir = path.join(os.homedir(), ".openclaw");
  const configPath = path.join(configDir, "openclaw.json");
  let originalConfig: string | null = null;

  beforeEach(() => {
    // Back up the real config
    try {
      originalConfig = fs.readFileSync(configPath, "utf-8");
    } catch {
      originalConfig = null;
    }
  });

  afterEach(() => {
    // Restore the original config
    if (originalConfig !== null) {
      fs.writeFileSync(configPath, originalConfig, "utf-8");
    }
    // Clean up env var if set
    delete process.env.OPENCLAW_GATEWAY_PASSWORD;
  });

  it("sends Bearer header with password when auth mode is password", async () => {
    // Write a test config with password auth mode
    const testConfig = {
      gateway: {
        port: 18789,
        auth: {
          mode: "password",
          password: "my-secret-password",
        },
      },
    };
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(testConfig), "utf-8");

    // Re-import to pick up the new config
    // Use a cache-busting query param to force re-evaluation
    const mod = await import(`../dist/installer/gateway-api.js?v=${Date.now()}`);

    const originalFetch = globalThis.fetch;
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = mock.fn(async (_url: string, init: any) => {
      capturedHeaders = init.headers || {};
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { id: "test-pw-123" } }),
      };
    }) as any;

    try {
      const result = await mod.createAgentCronJob({
        name: "test/password-auth",
        schedule: { kind: "every", everyMs: 300_000 },
        sessionTarget: "isolated",
        agentId: "test-agent",
        payload: {
          kind: "agentTurn",
          message: "test prompt",
        },
        enabled: true,
      });

      assert.equal(result.ok, true);
      assert.equal(
        capturedHeaders["Authorization"],
        "Bearer my-secret-password",
        "Should send password as Bearer token when auth mode is password"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sends Bearer header with token when auth mode is token", async () => {
    const testConfig = {
      gateway: {
        port: 18789,
        auth: {
          mode: "token",
          token: "my-token-value",
        },
      },
    };
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(testConfig), "utf-8");

    const mod = await import(`../dist/installer/gateway-api.js?v=token-${Date.now()}`);

    const originalFetch = globalThis.fetch;
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = mock.fn(async (_url: string, init: any) => {
      capturedHeaders = init.headers || {};
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { id: "test-tok-123" } }),
      };
    }) as any;

    try {
      const result = await mod.createAgentCronJob({
        name: "test/token-auth",
        schedule: { kind: "every", everyMs: 300_000 },
        sessionTarget: "isolated",
        agentId: "test-agent",
        payload: {
          kind: "agentTurn",
          message: "test prompt",
        },
        enabled: true,
      });

      assert.equal(result.ok, true);
      assert.equal(
        capturedHeaders["Authorization"],
        "Bearer my-token-value",
        "Should send token as Bearer token when auth mode is token"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses OPENCLAW_GATEWAY_PASSWORD env var for password mode", async () => {
    const testConfig = {
      gateway: {
        port: 18789,
        auth: {
          mode: "password",
          // No password in config — should use env var
        },
      },
    };
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(testConfig), "utf-8");

    process.env.OPENCLAW_GATEWAY_PASSWORD = "env-password-secret";

    const mod = await import(`../dist/installer/gateway-api.js?v=env-${Date.now()}`);

    const originalFetch = globalThis.fetch;
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = mock.fn(async (_url: string, init: any) => {
      capturedHeaders = init.headers || {};
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { id: "test-env-123" } }),
      };
    }) as any;

    try {
      const result = await mod.createAgentCronJob({
        name: "test/env-password",
        schedule: { kind: "every", everyMs: 300_000 },
        sessionTarget: "isolated",
        agentId: "test-agent",
        payload: {
          kind: "agentTurn",
          message: "test prompt",
        },
        enabled: true,
      });

      assert.equal(result.ok, true);
      assert.equal(
        capturedHeaders["Authorization"],
        "Bearer env-password-secret",
        "Should use OPENCLAW_GATEWAY_PASSWORD env var when auth mode is password"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sends Bearer header with password in checkCronToolAvailable", async () => {
    const testConfig = {
      gateway: {
        port: 18789,
        auth: {
          mode: "password",
          password: "check-cron-pw",
        },
      },
    };
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(testConfig), "utf-8");

    const mod = await import(`../dist/installer/gateway-api.js?v=check-${Date.now()}`);

    const originalFetch = globalThis.fetch;
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = mock.fn(async (_url: string, init: any) => {
      capturedHeaders = init.headers || {};
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: {} }),
      };
    }) as any;

    try {
      const result = await mod.checkCronToolAvailable();
      assert.equal(result.ok, true);
      assert.equal(
        capturedHeaders["Authorization"],
        "Bearer check-cron-pw",
        "checkCronToolAvailable should also use password auth"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
