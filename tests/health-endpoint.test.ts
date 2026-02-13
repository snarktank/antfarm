/**
 * Test: /health endpoint returns correct status and uptime
 */

import http from "node:http";
import { startDashboard } from "../dist/server/dashboard.js";

async function makeRequest(port: number, path: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}${path}`, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body,
        });
      });
    });
    req.on("error", reject);
  });
}

async function testHealthEndpoint(): Promise<void> {
  console.log("Test: /health endpoint returns correct JSON...");

  const port = 13333; // Use a different port to avoid conflicts
  const server = startDashboard(port);

  try {
    // Wait a bit for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    const response = await makeRequest(port, "/health");

    // AC1: GET /health returns JSON response
    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    // AC4: Response has Content-Type: application/json
    if (!response.headers["content-type"]?.includes("application/json")) {
      throw new Error(`Expected Content-Type: application/json, got ${response.headers["content-type"]}`);
    }

    // AC5: Response has Access-Control-Allow-Origin: * header
    if (response.headers["access-control-allow-origin"] !== "*") {
      throw new Error(`Expected Access-Control-Allow-Origin: *, got ${response.headers["access-control-allow-origin"]}`);
    }

    const data = JSON.parse(response.body);

    // AC2: Response includes 'status' field with value 'ok'
    if (data.status !== "ok") {
      throw new Error(`Expected status: "ok", got "${data.status}"`);
    }

    // AC3: Response includes 'uptime' field with numeric value in seconds
    if (typeof data.uptime !== "number") {
      throw new Error(`Expected uptime to be a number, got ${typeof data.uptime}`);
    }

    if (data.uptime <= 0) {
      throw new Error(`Expected uptime to be greater than 0, got ${data.uptime}`);
    }

    console.log("  ✓ Status code is 200");
    console.log("  ✓ Content-Type is application/json");
    console.log("  ✓ Access-Control-Allow-Origin is *");
    console.log(`  ✓ Response has status: "${data.status}"`);
    console.log(`  ✓ Response has uptime: ${data.uptime} seconds`);
    console.log("PASS: /health endpoint works correctly\n");
  } finally {
    server.close();
  }
}

async function runTests(): Promise<void> {
  console.log("\n=== Health Endpoint Tests ===\n");

  try {
    await testHealthEndpoint();
    console.log("All tests passed! ✓\n");
    process.exit(0);
  } catch (err) {
    console.error("\nFAIL:", err);
    process.exit(1);
  }
}

runTests();
