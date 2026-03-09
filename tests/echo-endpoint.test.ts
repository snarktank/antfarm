/**
 * Tests for the POST /echo endpoint on the dashboard server.
 * Verifies JSON round-trip, error handling, and method filtering.
 */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startDashboard } from "../dist/server/dashboard.js";

function postJson(port: number, path: string, body: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path, method: "POST", headers: { "Content-Type": "application/json" } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf-8") }));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function getRequest(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path, method: "GET" },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf-8") }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

describe("POST /echo endpoint", () => {
  it("returns HTTP 200 and echoes a simple JSON body", async () => {
    const server = startDashboard(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as { port: number }).port;
    after(() => server.close());

    const res = await postJson(port, "/echo", JSON.stringify({ hello: "world" }));
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.body), { hello: "world" });
  });

  it("returns HTTP 200 and echoes a nested JSON body", async () => {
    const server = startDashboard(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as { port: number }).port;
    after(() => server.close());

    const res = await postJson(port, "/echo", JSON.stringify({ nested: { a: 1 } }));
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.body), { nested: { a: 1 } });
  });

  it("returns HTTP 400 with error message for invalid JSON body", async () => {
    const server = startDashboard(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as { port: number }).port;
    after(() => server.close());

    const res = await postJson(port, "/echo", "not valid json");
    assert.equal(res.status, 400);
    assert.deepEqual(JSON.parse(res.body), { error: "invalid JSON" });
  });

  it("GET /echo falls through to serveHTML (not handled by echo route)", async () => {
    const server = startDashboard(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as { port: number }).port;
    after(() => server.close());

    const res = await getRequest(port, "/echo");
    // Should serve HTML, not JSON echo
    assert.equal(res.status, 200);
    assert.ok(res.body.includes("<!"), `expected HTML response, got: ${res.body.slice(0, 100)}`);
  });
});
