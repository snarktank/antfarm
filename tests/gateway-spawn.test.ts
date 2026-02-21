import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

describe("gateway-api spawnSession", () => {
  let spawnSession: typeof import("../dist/installer/gateway-api.js").spawnSession;

  beforeEach(async () => {
    const mod = await import(`../dist/installer/gateway-api.js?v=spawn-${Date.now()}`);
    spawnSession = mod.spawnSession;
  });

  it("passes sessionKey through to /tools/invoke", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          details: {
            status: "accepted",
            runId: "run-1",
            childSessionKey: "agent:feature-dev_setup:subagent:abc",
          },
        },
      }),
    })) as any;

    try {
      const res = await spawnSession({
        task: "smoke",
        sessionKey: "agent:feature-dev_setup:main",
      });
      assert.equal(res.ok, true);
      assert.equal(res.runId, "run-1");

      const fetchMock = globalThis.fetch as any;
      const callArgs = fetchMock.mock.calls[0].arguments;
      const body = JSON.parse(callArgs[1].body);
      assert.equal(body.sessionKey, "agent:feature-dev_setup:main");
      assert.equal(body.tool, "sessions_spawn");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("treats non-accepted details status as failure", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          details: {
            status: "error",
            error: "device token mismatch",
            childSessionKey: "agent:main:subagent:orphan",
          },
        },
      }),
    })) as any;

    try {
      const res = await spawnSession({ task: "smoke" });
      assert.equal(res.ok, false);
      assert.match(res.error ?? "", /device token mismatch/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns actionable error when sessions_spawn is HTTP-denied", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      status: 404,
      text: async () => "Tool not available: sessions_spawn",
    })) as any;

    try {
      const res = await spawnSession({ task: "smoke" });
      assert.equal(res.ok, false);
      assert.match(res.error ?? "", /gateway\.tools\.allow/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

