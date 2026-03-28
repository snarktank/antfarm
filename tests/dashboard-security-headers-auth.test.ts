/**
 * Regression test for fix-003: Dashboard security headers and authentication.
 * Verifies:
 *   - X-Frame-Options: DENY on all responses
 *   - X-Content-Type-Options: nosniff on all responses
 *   - Content-Security-Policy header present
 *   - API endpoints require authentication (401 without token)
 *   - API endpoints succeed with valid Bearer token
 *   - API endpoints succeed with valid ?token= query param
 */
import { describe, it, after, before } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startDashboard, getDashboardToken, _resetDashboardToken } from "../dist/server/dashboard.js";

const TEST_PORT = 3445;

function request(
  path: string,
  opts?: { origin?: string; authorization?: string },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (opts?.origin) headers["Origin"] = opts.origin;
    if (opts?.authorization) headers["Authorization"] = opts.authorization;
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

describe("Dashboard security headers and authentication", () => {
  let server: http.Server;
  let token: string;

  const ready = new Promise<void>((resolve) => {
    // Use env var for predictable token in tests
    process.env.ANTFARM_DASHBOARD_TOKEN = "test-secret-token-12345";
    _resetDashboardToken();
    server = startDashboard(TEST_PORT);
    server.on("listening", () => resolve());
  });

  before(async () => {
    await ready;
    token = getDashboardToken();
  });

  after(() => {
    server?.close();
    delete process.env.ANTFARM_DASHBOARD_TOKEN;
    _resetDashboardToken();
  });

  // --- Security Headers ---

  it("returns X-Frame-Options: DENY on API responses", async () => {
    const res = await request(`/api/workflows?token=${token}`);
    assert.equal(res.headers["x-frame-options"], "DENY");
  });

  it("returns X-Content-Type-Options: nosniff on API responses", async () => {
    const res = await request(`/api/workflows?token=${token}`);
    assert.equal(res.headers["x-content-type-options"], "nosniff");
  });

  it("returns Content-Security-Policy on API responses", async () => {
    const res = await request(`/api/workflows?token=${token}`);
    const csp = res.headers["content-security-policy"];
    assert.ok(csp, "CSP header should be present");
    assert.ok(String(csp).includes("default-src"), "CSP should include default-src");
  });

  it("returns security headers on HTML page", async () => {
    const res = await request("/");
    assert.equal(res.headers["x-frame-options"], "DENY");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.ok(res.headers["content-security-policy"]);
  });

  // --- Authentication ---

  it("rejects unauthenticated API requests with 401", async () => {
    const res = await request("/api/workflows");
    assert.equal(res.status, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.error, "unauthorized");
  });

  it("rejects API requests with wrong token", async () => {
    const res = await request("/api/workflows", {
      authorization: "Bearer wrong-token",
    });
    assert.equal(res.status, 401);
  });

  it("accepts API requests with valid Bearer token", async () => {
    const res = await request("/api/workflows", {
      authorization: `Bearer ${token}`,
    });
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.ok(Array.isArray(data));
  });

  it("accepts API requests with valid query token", async () => {
    const res = await request(`/api/workflows?token=${token}`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.ok(Array.isArray(data));
  });

  it("rejects /api/runs without auth", async () => {
    const res = await request("/api/runs");
    assert.equal(res.status, 401);
  });

  it("rejects /api/medic/status without auth", async () => {
    const res = await request("/api/medic/status");
    assert.equal(res.status, 401);
  });

  it("allows HTML page without auth (frontend served unauthenticated)", async () => {
    const res = await request("/");
    assert.equal(res.status, 200);
    assert.ok(res.headers["content-type"]?.includes("text/html"));
  });

  it("returns security headers on 401 responses too", async () => {
    const res = await request("/api/workflows");
    assert.equal(res.status, 401);
    assert.equal(res.headers["x-frame-options"], "DENY");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
  });
});
