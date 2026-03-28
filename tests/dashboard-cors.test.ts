/**
 * Regression test for fix-002: Dashboard CORS restriction.
 * Verifies that the dashboard only sets Access-Control-Allow-Origin
 * for localhost origins, rejecting cross-origin requests from other domains.
 */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startDashboard } from "../dist/server/dashboard.js";

const TEST_PORT = 3444;

function request(
  path: string,
  origin?: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (origin) headers["Origin"] = origin;
    const req = http.get(
      { hostname: "127.0.0.1", port: TEST_PORT, path, headers },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({ status: res.statusCode!, headers: res.headers, body }),
        );
      },
    );
    req.on("error", reject);
  });
}

describe("Dashboard CORS restrictions", () => {
  let server: http.Server;

  // Start server once before all tests — use a raw callback to wait for listen
  const ready = new Promise<void>((resolve) => {
    server = startDashboard(TEST_PORT);
    server.on("listening", () => resolve());
  });

  after(() => {
    server?.close();
  });

  it("returns CORS header for localhost origin", async () => {
    await ready;
    const res = await request("/api/workflows", "http://localhost:3333");
    assert.equal(
      res.headers["access-control-allow-origin"],
      "http://localhost:3333",
      "should echo back localhost origin",
    );
    assert.equal(res.headers["vary"], "Origin");
  });

  it("returns CORS header for 127.0.0.1 origin", async () => {
    await ready;
    const res = await request("/api/workflows", "http://127.0.0.1:3333");
    assert.equal(
      res.headers["access-control-allow-origin"],
      "http://127.0.0.1:3333",
      "should echo back 127.0.0.1 origin",
    );
  });

  it("does NOT return CORS header for foreign origin", async () => {
    await ready;
    const res = await request("/api/workflows", "https://evil.example.com");
    assert.equal(
      res.headers["access-control-allow-origin"],
      undefined,
      "should not set CORS header for foreign origin",
    );
  });

  it("does NOT return CORS header when no Origin sent", async () => {
    await ready;
    const res = await request("/api/workflows");
    assert.equal(
      res.headers["access-control-allow-origin"],
      undefined,
      "should not set CORS header when no Origin header",
    );
  });

  it("JSON API still returns data from localhost", async () => {
    await ready;
    const res = await request("/api/workflows", "http://localhost:3333");
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.ok(Array.isArray(data), "should return an array of workflows");
  });

  it("rejects CORS on font endpoint for foreign origin", async () => {
    await ready;
    const res = await request("/fonts/fake.woff2", "https://evil.example.com");
    // Font may 404 if file doesn't exist, but CORS header should not be present
    assert.equal(
      res.headers["access-control-allow-origin"],
      undefined,
      "font endpoint should not set CORS for foreign origin",
    );
  });
});
