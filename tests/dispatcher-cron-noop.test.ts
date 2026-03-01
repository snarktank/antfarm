/**
 * Tests to verify ensureDispatcherCron, enableDispatcher, disableDispatcher
 * are no-ops (n8n handles dispatching).
 */

import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

describe("dispatcher cron no-ops", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async (_url: any, _opts: any) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      };
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restoreAll();
  });

  it("ensureDispatcherCron returns {created: false, id: null} without HTTP calls", async () => {
    const { ensureDispatcherCron } = await import("../dist/installer/agent-cron.js");
    const result = await ensureDispatcherCron();
    assert.deepStrictEqual(result, { created: false, id: null });
    assert.strictEqual((globalThis.fetch as any).mock.calls.length, 0);
  });

  it("enableDispatcher resolves without throwing", async () => {
    const { enableDispatcher } = await import("../dist/installer/agent-cron.js");
    await assert.doesNotReject(() => enableDispatcher());
  });

  it("disableDispatcher resolves without throwing", async () => {
    const { disableDispatcher } = await import("../dist/installer/agent-cron.js");
    await assert.doesNotReject(() => disableDispatcher());
  });
});
