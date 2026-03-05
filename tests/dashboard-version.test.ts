import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { startDashboard } from "../dist/server/dashboard.js";

test("GET /version returns package version", async (t) => {
  const server = startDashboard(0); // Port 0 for random port
  
  // Wait for server to be listening
  await new Promise<void>((resolve) => {
    server.on("listening", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Server address not found");
  }
  const port = address.port;

  try {
    const res = await fetch(`http://localhost:${port}/version`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.ok(data.version, "Response should have a version key");
    
    // Read package.json to compare
    const pkgPath = path.resolve(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    assert.strictEqual(data.version, pkg.version);

  } finally {
    server.close();
  }
});
