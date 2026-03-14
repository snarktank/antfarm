import { test } from "node:test";
import assert from "node:assert";
import { startDashboard } from "../dist/server/dashboard.js";

test("GET /health returns 200 with status ok and timestamp", async () => {
  const server = startDashboard(0);
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("Invalid address");
  const port = addr.port;

  try {
    const res = await fetch(`http://localhost:${port}/health`);
    assert.strictEqual(res.status, 200);
    
    const data = await res.json();
    assert.strictEqual(data.status, "ok");
    assert.strictEqual(typeof data.timestamp, "number");
    assert.ok(data.timestamp > 0);
    assert.ok(data.timestamp <= Date.now());
  } finally {
    server.close();
  }
});
