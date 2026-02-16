import { test } from "node:test";
import assert from "node:assert";
import http from "node:http";

// Need to import from built file as per instructions
// @ts-ignore - Importing from dist which might not exist yet during typecheck
import { startDashboard } from "../dist/server/dashboard.js";

test("GET /health returns 200 OK with status and timestamp", async (t) => {
  // Start on random port
  const server = startDashboard(0);
  
  // Wait for listening
  await new Promise<void>((resolve) => {
    if (server.listening) return resolve();
    server.on("listening", resolve);
  });

  const address = server.address();
  const port = (typeof address === "object" && address) ? address.port : 0;
  
  try {
    const res = await fetch(`http://localhost:${port}/health`);
    assert.strictEqual(res.status, 200, "Status should be 200");
    
    const body = await res.json();
    assert.strictEqual(body.status, "ok", "Status in body should be ok");
    assert.ok(!isNaN(Date.parse(body.timestamp)), "Timestamp should be valid");
  } finally {
    server.close();
  }
});
