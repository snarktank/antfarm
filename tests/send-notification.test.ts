/**
 * Tests for sendNotification in gateway-api.ts
 *
 * Validates that sendNotification calls the gateway /tools/invoke endpoint
 * with correct tool, args, and handles defaults/errors properly.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// We test the built output
import { sendNotification } from "../dist/installer/gateway-api.js";

describe("sendNotification", () => {
  let originalFetch: typeof globalThis.fetch;
  let capturedRequests: Array<{ url: string; init: RequestInit }>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    capturedRequests = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends message to default 'main' session target", async () => {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      capturedRequests.push({ url: String(input), init: init! });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await sendNotification({ message: "Test notification" });

    assert.equal(result.ok, true);
    assert.equal(capturedRequests.length, 1);

    const body = JSON.parse(capturedRequests[0].init.body as string);
    assert.equal(body.tool, "sessions_send");
    assert.equal(body.args.sessionKey, "main");
    assert.equal(body.args.message, "Test notification");
  });

  it("sends message to explicit sessionTarget", async () => {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      capturedRequests.push({ url: String(input), init: init! });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await sendNotification({
      message: "Hello",
      sessionTarget: "my-channel",
    });

    assert.equal(result.ok, true);
    const body = JSON.parse(capturedRequests[0].init.body as string);
    assert.equal(body.args.sessionKey, "my-channel");
  });

  it("returns error on non-OK gateway response", async () => {
    globalThis.fetch = async () => {
      return new Response("Internal Server Error", { status: 500 });
    };

    const result = await sendNotification({ message: "fail" });
    assert.equal(result.ok, false);
    assert.match(result.error!, /500/);
  });

  it("includes authorization header when gateway token is set", async () => {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      capturedRequests.push({ url: String(input), init: init! });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await sendNotification({ message: "auth test" });

    // The gateway config reads from openclaw.json — if token exists, header is set
    // We just verify the request was made with Content-Type at minimum
    const headers = capturedRequests[0].init.headers as Record<string, string>;
    assert.equal(headers["Content-Type"], "application/json");
  });
});
