import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import http from "node:http";

// HTTP request helper
async function request(
  port: number,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode!, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode!, data });
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe("POST /api/usage", () => {
  let server: http.Server;
  const TEST_PORT = 33335;

  before(async () => {
    // Dynamically import the dashboard
    const { startDashboard } = await import("./dashboard.js");
    
    server = startDashboard(TEST_PORT);
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  after(async () => {
    server.close();
  });

  test("returns 400 if agent_id is missing", async () => {
    const { status, data } = await request(TEST_PORT, "POST", "/api/usage", {
      model: "claude-sonnet-4-5",
    });

    assert.strictEqual(status, 400);
    assert.deepStrictEqual(data, { error: "agent_id is required" });
  });

  test("returns 400 if model is missing", async () => {
    const { status, data } = await request(TEST_PORT, "POST", "/api/usage", {
      agent_id: "test-agent",
    });

    assert.strictEqual(status, 400);
    assert.deepStrictEqual(data, { error: "model is required" });
  });

  test("returns 400 if agent_id is not a string", async () => {
    const { status, data } = await request(TEST_PORT, "POST", "/api/usage", {
      agent_id: 123,
      model: "claude-sonnet-4-5",
    });

    assert.strictEqual(status, 400);
    assert.deepStrictEqual(data, { error: "agent_id is required" });
  });

  test("returns 400 if model is not a string", async () => {
    const { status, data } = await request(TEST_PORT, "POST", "/api/usage", {
      agent_id: "test-agent",
      model: 123,
    });

    assert.strictEqual(status, 400);
    assert.deepStrictEqual(data, { error: "model is required" });
  });

  test("returns 201 with id on success with minimal fields", async () => {
    const { status, data } = await request(TEST_PORT, "POST", "/api/usage", {
      agent_id: "minimal-agent",
      model: "claude-sonnet-4-5",
    });

    assert.strictEqual(status, 201);
    assert.ok((data as { id: string }).id, "Should return an id");
    assert.strictEqual(typeof (data as { id: string }).id, "string");
  });

  test("returns 201 with id on success with all fields", async () => {
    const { status, data } = await request(TEST_PORT, "POST", "/api/usage", {
      agent_id: "full-agent",
      model: "claude-opus-4",
      input_tokens: 1500,
      output_tokens: 800,
      cost_usd: 0.025,
      // Note: run_id/step_id can be any string since they're optional and no FK constraint enforced for this table
      task_label: "feature development",
    });

    assert.strictEqual(status, 201);
    const result = data as { id: string };
    assert.ok(result.id, "Should return an id");
    assert.strictEqual(typeof result.id, "string");
  });

  test("returns 400 when run_id references non-existent run", async () => {
    const { status, data } = await request(TEST_PORT, "POST", "/api/usage", {
      agent_id: "linked-agent",
      model: "test-model",
      run_id: "non-existent-run-id",
      step_id: "some-step-id",
    });

    // FK constraint rejects invalid run_id
    assert.strictEqual(status, 400);
    assert.deepStrictEqual(data, { error: "Invalid run_id reference" });
  });

  test("handles zero token values", async () => {
    const { status, data } = await request(TEST_PORT, "POST", "/api/usage", {
      agent_id: "zero-tokens-agent",
      model: "test-model",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
    });

    assert.strictEqual(status, 201);
    assert.ok((data as { id: string }).id, "Should return an id");
  });

  test("returns 400 on invalid JSON body", async () => {
    const { status, data } = await new Promise<{ status: number; data: unknown }>((resolve, reject) => {
      const options = {
        hostname: "127.0.0.1",
        port: TEST_PORT,
        path: "/api/usage",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      };

      const req = http.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode!, data: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode!, data: body });
          }
        });
      });

      req.on("error", reject);
      req.write("{ invalid json }");
      req.end();
    });

    assert.strictEqual(status, 400);
    assert.deepStrictEqual(data, { error: "Invalid JSON body" });
  });

  test("returns 400 on empty body", async () => {
    const { status, data } = await request(TEST_PORT, "POST", "/api/usage", {});

    assert.strictEqual(status, 400);
    assert.deepStrictEqual(data, { error: "agent_id is required" });
  });
});
