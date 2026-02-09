/**
 * Regression test for fix-005: Verify error messages from gateway API
 * do not leak internal URLs, tokens, or port configuration.
 */

// We test the sanitizeError function indirectly by calling the exported
// functions with a failing gateway (no server running on the target port).
// The returned error messages must not contain internal URLs or tokens.

import { createAgentCronJob, listCronJobs, deleteCronJob, sanitizeError } from "../gateway-api.js";

const SENSITIVE_PATTERNS = [
  /http:\/\/127\.0\.0\.1/,
  /http:\/\/localhost/,
  /:\d{4,5}/,           // port numbers like :18789
  /Bearer\s+[^\[]/,     // real Bearer tokens (not [redacted])
  /token=[^[]/,         // real token values
];

function assertNoLeaks(error: string | undefined, context: string) {
  if (!error) {
    console.log(`  SKIP (no error returned — gateway is running) — ${context}`);
    return;
  }
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(error)) {
      throw new Error(
        `${context}: error message leaks sensitive info matching ${pattern}: "${error}"`
      );
    }
  }
}

function testSanitizeError() {
  console.log("Test: sanitizeError should redact URLs");
  const r1 = sanitizeError(new Error("connect ECONNREFUSED http://127.0.0.1:18789/tools/invoke"));
  if (/127\.0\.0\.1/.test(r1) || /18789/.test(r1)) throw new Error(`Leaked URL: ${r1}`);
  console.log("  PASS —", r1);

  console.log("Test: sanitizeError should redact Bearer tokens");
  const r2 = sanitizeError("Authorization failed: Bearer sk-live-abc123xyz");
  if (/sk-live/.test(r2)) throw new Error(`Leaked token: ${r2}`);
  console.log("  PASS —", r2);

  console.log("Test: sanitizeError should redact token= values");
  const r3 = sanitizeError("Config token=mysecrettoken123 on port 18789");
  if (/mysecret/.test(r3)) throw new Error(`Leaked token: ${r3}`);
  console.log("  PASS —", r3);

  console.log("Test: sanitizeError should preserve non-sensitive info");
  const r4 = sanitizeError("ECONNREFUSED - connection refused");
  if (!/ECONNREFUSED/.test(r4)) throw new Error(`Lost useful info: ${r4}`);
  console.log("  PASS —", r4);
}

async function runTests() {
  testSanitizeError();

  console.log("Test: createAgentCronJob should not leak sensitive details in errors");
  const createResult = await createAgentCronJob({
    name: "test-job",
    schedule: { kind: "interval", everyMs: 60000 },
    sessionTarget: "test",
    agentId: "test",
    payload: { kind: "message", message: "test" },
    delivery: { mode: "enqueue" },
    enabled: false,
  });
  assertNoLeaks(createResult.error, "createAgentCronJob");
  console.log("  PASS — error:", createResult.error);

  console.log("Test: listCronJobs should not leak sensitive details in errors");
  const listResult = await listCronJobs();
  assertNoLeaks(listResult.error, "listCronJobs");
  console.log("  PASS — error:", listResult.error);

  console.log("Test: deleteCronJob should not leak sensitive details in errors");
  const deleteResult = await deleteCronJob("nonexistent");
  assertNoLeaks(deleteResult.error, "deleteCronJob");
  console.log("  PASS — error:", deleteResult.error);

  console.log("\nAll regression tests passed ✓");
}

runTests().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
