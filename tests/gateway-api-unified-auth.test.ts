import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Regression test: all gateway HTTP functions must use consistent auth headers.
 *
 * Before this fix, each of the 4 HTTP functions (createAgentCronJobHTTP,
 * listCronJobsHTTP, deleteCronJobHTTP, checkCronToolAvailable) independently
 * constructed their own Authorization headers by calling getGatewayConfig()
 * and manually building the headers object. This duplication meant a change
 * to auth logic (e.g. a new header, a different auth scheme) had to be
 * replicated in 4 places.
 *
 * The fix extracts a shared `gatewayFetch()` helper. This test verifies that
 * ALL exported HTTP-facing functions send identical Authorization headers for
 * the same config, proving they share a single auth code path.
 */

const configDir = path.join(os.homedir(), ".openclaw");
const configPath = path.join(configDir, "openclaw.json");

/** Helper: temporarily write a config, run a callback, then restore. */
async function withConfig<T>(config: object, fn: () => Promise<T>): Promise<T> {
  let originalConfig: string | null = null;
  try {
    originalConfig = fs.readFileSync(configPath, "utf-8");
  } catch {
    originalConfig = null;
  }

  try {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config), "utf-8");
    return await fn();
  } finally {
    if (originalConfig !== null) {
      fs.writeFileSync(configPath, originalConfig, "utf-8");
    }
  }
}

/** Helper: temporarily mock globalThis.fetch, run a callback, then restore. */
async function withMockFetch<T>(
  mockImpl: (...args: any[]) => any,
  fn: (fetchMock: ReturnType<typeof mock.fn>) => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const mockFn = mock.fn(mockImpl) as any;
  globalThis.fetch = mockFn;
  try {
    return await fn(mockFn);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const okResponse = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, result: { id: "test-id", jobs: [] } }),
  text: async () => "ok",
});

describe("gateway-api unified auth helper (regression)", () => {
  it("all HTTP functions send identical Authorization headers", async () => {
    const testConfig = {
      gateway: { port: 18789, auth: { mode: "token", token: "unified-auth-test-secret" } },
    };

    await withConfig(testConfig, async () => {
      const mod = await import(`../dist/installer/gateway-api.js?v=unified-${Date.now()}`);
      const capturedHeaders: Array<string | undefined> = [];

      await withMockFetch(
        async (_url: string, init: any) => {
          capturedHeaders.push(init.headers?.["Authorization"]);
          return okResponse();
        },
        async () => {
          // 1. createAgentCronJob (triggers createAgentCronJobHTTP)
          await mod.createAgentCronJob({
            name: "test/unified-auth",
            schedule: { kind: "every", everyMs: 300_000 },
            sessionTarget: "isolated",
            agentId: "test-agent",
            payload: { kind: "agentTurn", message: "test" },
            enabled: true,
          });

          // 2. checkCronToolAvailable
          await mod.checkCronToolAvailable();

          // 3. listCronJobs (triggers listCronJobsHTTP)
          await mod.listCronJobs();

          // 4. deleteCronJob (triggers deleteCronJobHTTP)
          await mod.deleteCronJob("test-job-id");

          // All 4 calls should have been made
          assert.equal(capturedHeaders.length, 4, "Expected exactly 4 fetch calls");

          // All should have the same Authorization header
          const expectedAuth = "Bearer unified-auth-test-secret";
          for (let i = 0; i < capturedHeaders.length; i++) {
            assert.equal(
              capturedHeaders[i],
              expectedAuth,
              `Fetch call #${i + 1} should have Authorization: ${expectedAuth}`,
            );
          }

          // Verify they're all identical (the core regression check)
          const uniqueAuths = new Set(capturedHeaders);
          assert.equal(uniqueAuths.size, 1, "All HTTP functions must use the same auth header value");
        },
      );
    });
  });

  it("all HTTP functions send Content-Type: application/json", async () => {
    const testConfig = {
      gateway: { port: 18789, auth: { mode: "token", token: "ct-test" } },
    };

    await withConfig(testConfig, async () => {
      const mod = await import(`../dist/installer/gateway-api.js?v=ct-${Date.now()}`);
      const capturedContentTypes: string[] = [];

      await withMockFetch(
        async (_url: string, init: any) => {
          capturedContentTypes.push(init.headers?.["Content-Type"]);
          return okResponse();
        },
        async () => {
          await mod.createAgentCronJob({
            name: "test/ct",
            schedule: { kind: "every", everyMs: 300_000 },
            sessionTarget: "isolated",
            agentId: "test",
            payload: { kind: "agentTurn", message: "t" },
            enabled: true,
          });
          await mod.checkCronToolAvailable();
          await mod.listCronJobs();
          await mod.deleteCronJob("id");

          assert.equal(capturedContentTypes.length, 4);
          for (const ct of capturedContentTypes) {
            assert.equal(ct, "application/json");
          }
        },
      );
    });
  });

  it("all HTTP functions hit the same /tools/invoke endpoint", async () => {
    const testConfig = {
      gateway: { port: 18789, auth: { mode: "token", token: "url-test" } },
    };

    await withConfig(testConfig, async () => {
      const mod = await import(`../dist/installer/gateway-api.js?v=url-${Date.now()}`);
      const capturedUrls: string[] = [];

      await withMockFetch(
        async (url: string) => {
          capturedUrls.push(url);
          return okResponse();
        },
        async () => {
          await mod.createAgentCronJob({
            name: "test/url",
            schedule: { kind: "every", everyMs: 300_000 },
            sessionTarget: "isolated",
            agentId: "test",
            payload: { kind: "agentTurn", message: "t" },
            enabled: true,
          });
          await mod.checkCronToolAvailable();
          await mod.listCronJobs();
          await mod.deleteCronJob("id");

          assert.equal(capturedUrls.length, 4);
          const expectedUrl = "http://127.0.0.1:18789/tools/invoke";
          for (const url of capturedUrls) {
            assert.equal(url, expectedUrl);
          }
        },
      );
    });
  });

  it("omits Authorization header when no secret is configured", async () => {
    const noAuthConfig = { gateway: { port: 18789 } };

    await withConfig(noAuthConfig, async () => {
      const mod = await import(`../dist/installer/gateway-api.js?v=noauth-${Date.now()}`);
      const capturedHeaders: Array<Record<string, string>> = [];

      await withMockFetch(
        async (_url: string, init: any) => {
          capturedHeaders.push({ ...init.headers });
          return okResponse();
        },
        async () => {
          await mod.createAgentCronJob({
            name: "test/noauth",
            schedule: { kind: "every", everyMs: 300_000 },
            sessionTarget: "isolated",
            agentId: "test",
            payload: { kind: "agentTurn", message: "t" },
            enabled: true,
          });
          await mod.listCronJobs();

          for (const headers of capturedHeaders) {
            assert.equal(
              headers["Authorization"],
              undefined,
              "Should not send Authorization when no secret is configured",
            );
          }
        },
      );
    });
  });
});
