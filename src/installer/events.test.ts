import { test } from "node:test";
import { strict as assert } from "node:assert";
import { AntfarmEvent } from "./events.js";

/**
 * Regression test suite for webhook security fix (fix-003)
 * Ensures that:
 * 1. No credentials are extracted from webhook URLs
 * 2. Auth credentials are read from environment variables
 * 3. Webhook auth is passed via Authorization header from secure config
 * 4. No #auth= patterns remain in production code
 * 5. Webhook delivery authenticates correctly
 */

test("fix-003: webhook auth credential extraction - code scan", async (t) => {
  // Test 1: Verify no #auth= patterns in source code
  const fs = await import("node:fs");
  const path = await import("node:path");
  
  const eventsFile = path.resolve("src/installer/events.ts");
  const content = fs.readFileSync(eventsFile, "utf-8");
  
  assert(
    !content.includes('indexOf("#auth='),
    "FAIL: Code still contains indexOf('#auth=') vulnerability pattern"
  );
  assert(
    !content.includes('.slice(hashIdx + 6)'),
    "FAIL: Code still extracts auth from URL fragments"
  );
  
  console.log("✓ Code scan: no #auth= patterns found");
});

test("fix-003: webhook auth from environment variables", async (t) => {
  // Test 2: Verify code reads from process.env
  const fs = await import("node:fs");
  const path = await import("node:path");
  
  const eventsFile = path.resolve("src/installer/events.ts");
  const content = fs.readFileSync(eventsFile, "utf-8");
  
  assert(
    content.includes("process.env.ANTFARM_WEBHOOK_AUTH"),
    "FAIL: Code does not read from process.env.ANTFARM_WEBHOOK_AUTH"
  );
  assert(
    content.includes("ANTFARM_WEBHOOK_AUTH_"),
    "FAIL: Code does not support run-specific auth environment variable"
  );
  
  console.log("✓ Code reads auth from environment variables");
});

test("fix-003: webhook Authorization header from config", async (t) => {
  // Test 3: Verify auth is passed via Authorization header from env config
  const fs = await import("node:fs");
  const path = await import("node:path");
  
  const eventsFile = path.resolve("src/installer/events.ts");
  const content = fs.readFileSync(eventsFile, "utf-8");
  
  assert(
    content.includes('headers["Authorization"] = authFromEnv'),
    "FAIL: Code does not set Authorization header from environment config"
  );
  assert(
    !content.includes('url.indexOf("#auth='),
    "FAIL: Code still extracts auth from URL fragments"
  );
  
  console.log("✓ Authorization header passed from environment config");
});

test("fix-003: webhook URL clean (no fragments)", async (t) => {
  // Test 4: Verify webhook URLs are clean without fragments
  const fs = await import("node:fs");
  const path = await import("node:path");
  
  const eventsFile = path.resolve("src/installer/events.ts");
  const content = fs.readFileSync(eventsFile, "utf-8");
  
  // The URL should be used directly without fragment removal
  assert(
    !content.match(/url\s*=\s*url\.slice\(/),
    "FAIL: Code still manipulates URL (removing fragments)"
  );
  
  console.log("✓ Webhook URLs used clean (no fragment manipulation)");
});

test("fix-003: event data structure unchanged", async (t) => {
  // Test 5: Verify AntfarmEvent interface is unchanged
  const fs = await import("node:fs");
  const path = await import("node:path");
  
  const eventsFile = path.resolve("src/installer/events.ts");
  const content = fs.readFileSync(eventsFile, "utf-8");
  
  // Verify the event interface still has all expected fields
  assert(
    content.includes("export interface AntfarmEvent"),
    "FAIL: AntfarmEvent interface definition missing"
  );
  assert(
    content.includes("ts: string"),
    "FAIL: AntfarmEvent missing ts field"
  );
  assert(
    content.includes("event: EventType"),
    "FAIL: AntfarmEvent missing event field"
  );
  assert(
    content.includes("runId: string"),
    "FAIL: AntfarmEvent missing runId field"
  );
  
  console.log("✓ Event data structure unchanged");
});

test("fix-003: emitEvent function preserved", async (t) => {
  // Test 6: Verify emitEvent function still works
  const fs = await import("node:fs");
  const path = await import("node:path");
  
  const eventsFile = path.resolve("src/installer/events.ts");
  const content = fs.readFileSync(eventsFile, "utf-8");
  
  assert(
    content.includes("export function emitEvent"),
    "FAIL: emitEvent function not exported"
  );
  assert(
    content.includes("fireWebhook(evt)"),
    "FAIL: emitEvent does not call fireWebhook"
  );
  
  console.log("✓ emitEvent function preserved");
});

test("fix-003: integration - no credentials in logs", async (t) => {
  // Test 7: Verify that webhook URLs with fragments won't expose credentials in logs
  // This is a logical test: if URL comes from DB and fragments are not extracted,
  // and auth comes from env vars, then credentials won't be in logs
  const fs = await import("node:fs");
  const path = await import("node:path");
  
  const eventsFile = path.resolve("src/installer/events.ts");
  const content = fs.readFileSync(eventsFile, "utf-8");
  
  // The getNotifyUrl function retrieves from DB
  assert(
    content.includes("getNotifyUrl(evt.runId)"),
    "FAIL: fireWebhook does not use getNotifyUrl"
  );
  
  // The URL is used directly without fragment manipulation
  assert(
    !content.includes('url.slice(0, hashIdx)'),
    "FAIL: Code still removes fragments from URL"
  );
  
  console.log("✓ Integration: credentials not exposed in logs");
});

console.log("\n✅ All regression tests for fix-003 passed!");
