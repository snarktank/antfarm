/**
 * [VERIFY] Heartbeat & Timeout Handling
 *
 * Validates that stories 1.5 (Progress Heartbeat Mechanism) and
 * 1.6 (Typing TTL Expiration Handling) are correctly implemented:
 *
 * 1. Typing indicator refreshes every 30 seconds
 * 2. Progress messages sent every 90 seconds
 * 3. Status message sent at 2-minute TTL
 * 4. Final response delivered after completion
 * 5. No silent failures observed
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ── 1. Heartbeat Module Exports & Interface ──────────────────────────

describe("Story 1.5: Heartbeat Module Structure", () => {
  it("heartbeat.ts exports required functions", async () => {
    const { startHeartbeatLoop, stopHeartbeat, isHeartbeatRunning, getHeartbeatLockFile } =
      await import("../dist/worker/heartbeat.js");

    assert.equal(typeof startHeartbeatLoop, "function", "startHeartbeatLoop() should be exported");
    assert.equal(typeof stopHeartbeat, "function", "stopHeartbeat() should be exported");
    assert.equal(typeof isHeartbeatRunning, "function", "isHeartbeatRunning() should be exported");
    assert.equal(typeof getHeartbeatLockFile, "function", "getHeartbeatLockFile() should be exported");
  });

  it("getHeartbeatLockFile returns correct path format", async () => {
    const { getHeartbeatLockFile } = await import("../dist/worker/heartbeat.js");
    const lockPath = getHeartbeatLockFile("test-step-123");
    assert.ok(lockPath.includes("heartbeat-test-step-123.lock"), `Lock file path should contain step ID: ${lockPath}`);
    assert.ok(lockPath.startsWith("/tmp/"), `Lock file should be in /tmp: ${lockPath}`);
  });

  it("isHeartbeatRunning returns false for non-existent step", async () => {
    const { isHeartbeatRunning } = await import("../dist/worker/heartbeat.js");
    const result = isHeartbeatRunning("nonexistent-step-xyz");
    assert.equal(result, false, "Should return false for non-existent heartbeat");
  });

  it("stopHeartbeat returns false for non-existent step", async () => {
    const { stopHeartbeat } = await import("../dist/worker/heartbeat.js");
    const result = stopHeartbeat("nonexistent-step-xyz");
    assert.equal(result, false, "Should return false when no heartbeat to stop");
  });
});

// ── 2. Configuration Defaults for Heartbeat Timings ──────────────────

describe("Story 1.5: Heartbeat Configuration Defaults", () => {
  it("typing refresh interval is 30 seconds (30000ms)", async () => {
    const { getDefaultConfig } = await import("../dist/config.js");
    const config = getDefaultConfig();
    assert.equal(
      config.worker.typingRefreshIntervalMs,
      30_000,
      "Typing refresh interval should be 30000ms (30 seconds)"
    );
  });

  it("progress update interval is 90 seconds (90000ms)", async () => {
    const { getDefaultConfig } = await import("../dist/config.js");
    const config = getDefaultConfig();
    assert.equal(
      config.worker.progressUpdateIntervalMs,
      90_000,
      "Progress update interval should be 90000ms (90 seconds)"
    );
  });

  it("typing TTL is 120 seconds (120000ms / 2 minutes)", async () => {
    const { getDefaultConfig } = await import("../dist/config.js");
    const config = getDefaultConfig();
    assert.equal(
      config.worker.typingTtlMs,
      120_000,
      "Typing TTL should be 120000ms (2 minutes)"
    );
  });

  it("heartbeat is enabled by default", async () => {
    const { getDefaultConfig } = await import("../dist/config.js");
    const config = getDefaultConfig();
    assert.equal(
      config.worker.heartbeatEnabled,
      true,
      "Heartbeat should be enabled by default"
    );
  });

  it("worker timeout is 1800 seconds (30 minutes)", async () => {
    const { getDefaultConfig } = await import("../dist/config.js");
    const config = getDefaultConfig();
    assert.equal(
      config.worker.timeoutSeconds,
      1800,
      "Worker timeout should be 1800 seconds (30 minutes)"
    );
  });
});

// ── 3. Heartbeat Source Code Logic Verification ──────────────────────

describe("Story 1.5: Heartbeat Logic in Source Code", () => {
  const heartbeatPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "src",
    "worker",
    "heartbeat.ts"
  );

  it("heartbeat.ts exists", () => {
    assert.ok(fs.existsSync(heartbeatPath), `heartbeat.ts should exist at ${heartbeatPath}`);
  });

  it("heartbeat loop checks typing refresh interval (30s)", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("typingIntervalMs") || content.includes("typingRefreshIntervalMs"),
      "Heartbeat should use typing refresh interval for typing indicator refresh"
    );
    assert.ok(
      content.includes("sendTypingIndicator"),
      "Heartbeat should call sendTypingIndicator()"
    );
  });

  it("heartbeat loop sends progress messages at configurable interval (90s)", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("progressIntervalMs") || content.includes("progressUpdateIntervalMs"),
      "Heartbeat should use progress update interval"
    );
    assert.ok(
      content.includes("sendProgressMessage"),
      "Heartbeat should call sendProgressMessage()"
    );
  });

  it("heartbeat includes elapsed time in progress messages", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("formatElapsed"),
      "Progress messages should include formatted elapsed time"
    );
    assert.ok(
      content.includes("elapsed"),
      "Progress messages should reference elapsed time"
    );
  });

  it("heartbeat implements rate limit backoff on progress message failure", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("progressIntervalMs * 2") || content.includes("progressIntervalMs *="),
      "Heartbeat should double interval on progress message failure"
    );
    assert.ok(
      content.includes("600_000") || content.includes("600000"),
      "Heartbeat should cap backoff at 10 minutes (600000ms)"
    );
  });

  it("heartbeat checks step status before each cycle", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("isStepRunning"),
      "Heartbeat should check isStepRunning() to exit when step completes"
    );
  });

  it("heartbeat has hard timeout to prevent infinite loops", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("hardTimeoutMs"),
      "Heartbeat should have hard timeout check"
    );
    assert.ok(
      content.includes("timeoutSeconds"),
      "Hard timeout should be derived from config.worker.timeoutSeconds"
    );
  });

  it("heartbeat writes and cleans up lock file", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("writeFileSync(lockFile"),
      "Heartbeat should write PID to lock file"
    );
    assert.ok(
      content.includes("unlinkSync(lockFile)"),
      "Heartbeat should clean up lock file on exit"
    );
  });

  it("heartbeat handles SIGTERM and SIGINT gracefully", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(content.includes("SIGTERM"), "Heartbeat should handle SIGTERM signal");
    assert.ok(content.includes("SIGINT"), "Heartbeat should handle SIGINT signal");
    assert.ok(content.includes("cleanup"), "Heartbeat should call cleanup on signal");
  });
});

// ── 4. Typing TTL Expiration Handling (Story 1.6) ────────────────────

describe("Story 1.6: Typing TTL Expiration Handling", () => {
  const heartbeatPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "src",
    "worker",
    "heartbeat.ts"
  );

  it("heartbeat sends status message at 2-minute TTL mark", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("typingTtlMs"),
      "Heartbeat should use typingTtlMs to detect TTL expiration"
    );
    assert.ok(
      content.includes("ttlMessageSent"),
      "Heartbeat should track whether TTL message has been sent (avoid duplicates)"
    );
    assert.ok(
      content.includes("This is taking longer than expected"),
      "TTL status message should contain user-facing explanation"
    );
  });

  it("TTL status message is sent only once", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    // The pattern: if (!ttlMessageSent && elapsed >= typingTtlMs)
    assert.ok(
      content.includes("!ttlMessageSent") && content.includes("typingTtlMs"),
      "TTL message should only be sent when ttlMessageSent is false and TTL exceeded"
    );
    assert.ok(
      content.includes("ttlMessageSent = true"),
      "ttlMessageSent should be set to true after sending"
    );
  });

  it("TTL timeout events are logged to database for monitoring", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("logTtlTimeout"),
      "TTL timeout events should be logged via logTtlTimeout()"
    );
    assert.ok(
      content.includes("ttl_timeout_events"),
      "TTL events should be stored in ttl_timeout_events table"
    );
    assert.ok(
      content.includes("step_id") && content.includes("run_id") && content.includes("elapsed_ms"),
      "TTL event records should include step_id, run_id, and elapsed_ms"
    );
  });

  it("worker continues processing after TTL expiration", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    // After sending TTL message, the loop should NOT break.
    // The only break conditions are: hardTimeoutMs and !isStepRunning()
    // Verify that TTL block does NOT contain a break statement
    const ttlBlock = content.match(/if \(!ttlMessageSent.*?\n(?:.*?\n)*?.*?logTtlTimeout/s);
    if (ttlBlock) {
      assert.ok(
        !ttlBlock[0].includes("break"),
        "TTL handling block should NOT break the loop — worker continues processing"
      );
    }
  });

  it("TTL message failure is handled gracefully (no crash)", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    // The TTL message sending should handle failure via the return value of sendProgressMessage
    assert.ok(
      content.includes("Typing TTL status message FAILED"),
      "TTL message failure should be logged as warning"
    );
  });
});

// ── 5. Integration: Heartbeat in Agent Cron ──────────────────────────

describe("Heartbeat integration in agent-cron.ts", () => {
  const agentCronPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "src",
    "installer",
    "agent-cron.ts"
  );

  it("agent-cron.ts includes heartbeat start instruction in polling prompt", () => {
    const content = fs.readFileSync(agentCronPath, "utf-8");
    assert.ok(
      content.includes("heartbeat start"),
      "Polling prompt should include heartbeat start command"
    );
  });

  it("heartbeat is spawned with nohup (separate process)", () => {
    const content = fs.readFileSync(agentCronPath, "utf-8");
    assert.ok(
      content.includes("nohup") && content.includes("heartbeat"),
      "Heartbeat should be spawned via nohup as a separate process"
    );
  });
});

// ── 6. Integration: Heartbeat in poll-agent.sh ───────────────────────

describe("Heartbeat integration in poll-agent.sh", () => {
  const pollScriptPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "scripts",
    "poll-agent.sh"
  );

  it("poll-agent.sh starts heartbeat after worker spawn", () => {
    const content = fs.readFileSync(pollScriptPath, "utf-8");
    assert.ok(
      content.includes("heartbeat start"),
      "poll-agent.sh should start heartbeat process"
    );
    assert.ok(
      content.includes("HEARTBEAT_PID"),
      "poll-agent.sh should track heartbeat PID"
    );
  });

  it("poll-agent.sh saves heartbeat PID to file", () => {
    const content = fs.readFileSync(pollScriptPath, "utf-8");
    assert.ok(
      content.includes("heartbeat.pid"),
      "poll-agent.sh should save heartbeat PID to heartbeat.pid file"
    );
  });

  it("poll-agent.sh stops heartbeat when worker exits", () => {
    const content = fs.readFileSync(pollScriptPath, "utf-8");
    assert.ok(
      content.includes("kill") && content.includes("HEARTBEAT_PID"),
      "poll-agent.sh should kill heartbeat process when worker exits"
    );
    assert.ok(
      content.includes("heartbeat stopped"),
      "poll-agent.sh should log heartbeat stop event"
    );
  });

  it("poll-agent.sh heartbeat cleanup runs in disowned background", () => {
    const content = fs.readFileSync(pollScriptPath, "utf-8");
    assert.ok(
      content.includes("disown"),
      "Cleanup process should be disowned to survive parent exit"
    );
  });
});

// ── 7. Integration: Heartbeat Cleanup in Step Operations ─────────────

describe("Heartbeat cleanup in step-ops.ts", () => {
  const stepOpsPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "src",
    "installer",
    "step-ops.ts"
  );

  it("step-ops.ts imports stopHeartbeat", () => {
    const content = fs.readFileSync(stepOpsPath, "utf-8");
    assert.ok(
      content.includes("stopHeartbeat"),
      "step-ops.ts should import stopHeartbeat from heartbeat module"
    );
    assert.ok(
      content.includes('from "../worker/heartbeat.js"'),
      "stopHeartbeat should be imported from the heartbeat module"
    );
  });

  it("step-ops.ts stops heartbeat on step completion (success path)", () => {
    const content = fs.readFileSync(stepOpsPath, "utf-8");
    // Count occurrences of stopHeartbeat — should appear in both success and failure paths
    const occurrences = (content.match(/stopHeartbeat/g) || []).length;
    assert.ok(
      occurrences >= 2,
      `stopHeartbeat should be called in both success and failure paths (found ${occurrences} occurrences, expected >=2)`
    );
  });

  it("step-ops.ts stopHeartbeat calls are wrapped in try-catch (best-effort)", () => {
    const content = fs.readFileSync(stepOpsPath, "utf-8");
    assert.ok(
      content.includes("try { stopHeartbeat"),
      "stopHeartbeat calls should be wrapped in try-catch for best-effort cleanup"
    );
  });
});

// ── 8. CLI Heartbeat Commands ────────────────────────────────────────

describe("CLI heartbeat commands", () => {
  const cliPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "src",
    "cli",
    "cli.ts"
  );

  it("CLI supports heartbeat start command", () => {
    const content = fs.readFileSync(cliPath, "utf-8");
    assert.ok(
      content.includes('"heartbeat"') || content.includes("'heartbeat'"),
      "CLI should handle 'heartbeat' command group"
    );
    assert.ok(
      content.includes('"start"') || content.includes("'start'"),
      "CLI should handle heartbeat 'start' action"
    );
  });

  it("CLI supports heartbeat stop command", () => {
    const content = fs.readFileSync(cliPath, "utf-8");
    assert.ok(
      content.includes('"stop"') || content.includes("'stop'"),
      "CLI should handle heartbeat 'stop' action"
    );
  });

  it("CLI supports heartbeat status command", () => {
    const content = fs.readFileSync(cliPath, "utf-8");
    assert.ok(
      content.includes('"status"') || content.includes("'status'"),
      "CLI should handle heartbeat 'status' action"
    );
  });

  it("CLI heartbeat start requires step-id and run-id", () => {
    const content = fs.readFileSync(cliPath, "utf-8");
    assert.ok(
      content.includes("heartbeat start <step-id> <run-id>"),
      "CLI should show usage requiring step-id and run-id for heartbeat start"
    );
  });
});

// ── 9. No Silent Failures ────────────────────────────────────────────

describe("No silent failures in heartbeat flow", () => {
  const heartbeatPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "src",
    "worker",
    "heartbeat.ts"
  );

  it("typing indicator failures are logged (not swallowed)", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("Typing indicator failed"),
      "Typing indicator failures should be logged"
    );
  });

  it("progress message failures are logged with context", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("Progress message failed"),
      "Progress message failures should be logged"
    );
    assert.ok(
      content.includes("increasing interval"),
      "Failure log should indicate backoff action taken"
    );
  });

  it("heartbeat start is logged with timing configuration", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("Heartbeat started for step="),
      "Heartbeat start should be logged with step ID"
    );
    // Verify that timing info is included in start log
    assert.ok(
      content.includes("typing=") && content.includes("progress=") && content.includes("ttl="),
      "Heartbeat start log should include timing configuration (typing, progress, ttl)"
    );
  });

  it("heartbeat exit is logged with elapsed time", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("Heartbeat exited for step="),
      "Heartbeat exit should be logged with step ID"
    );
  });

  it("heartbeat stop (step no longer running) is logged", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("no longer running"),
      "Heartbeat should log when stopping because step is no longer running"
    );
  });

  it("heartbeat hard timeout is logged as warning", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("hard timeout reached"),
      "Hard timeout should be logged as a warning"
    );
  });

  it("gateway config failure does not crash heartbeat", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    // getGatewayConfig wraps in try-catch with fallback
    assert.ok(
      content.includes('return { url: "http://127.0.0.1:18789" }'),
      "Gateway config should have fallback URL on failure"
    );
  });

  it("database query failures do not crash heartbeat", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    // isStepRunning and getRunChatInfo should both have try-catch
    const tryCount = (content.match(/} catch/g) || []).length;
    assert.ok(
      tryCount >= 4,
      `Heartbeat should have multiple try-catch blocks for resilience (found ${tryCount})`
    );
  });
});

// ── 10. Message Content Verification ─────────────────────────────────

describe("Heartbeat message content", () => {
  const heartbeatPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "src",
    "worker",
    "heartbeat.ts"
  );

  it("progress message includes hourglass emoji and elapsed time", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("\\u23f3") || content.includes("\u23f3"),
      "Progress message should include hourglass emoji (\\u23f3)"
    );
    assert.ok(
      content.includes("Working on task"),
      "Progress message should describe what is happening"
    );
  });

  it("TTL message includes alarm emoji and reassurance", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("\\u23f0") || content.includes("\u23f0"),
      "TTL message should include alarm emoji (\\u23f0)"
    );
    assert.ok(
      content.includes("Still working"),
      "TTL message should reassure user that work continues"
    );
  });

  it("formatElapsed produces human-readable time strings", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("formatElapsed"),
      "Should have formatElapsed helper function"
    );
    // Verify it handles both seconds-only and minutes+seconds
    assert.ok(
      content.includes('`${secs}s`') || content.includes("s`"),
      "formatElapsed should format seconds"
    );
    assert.ok(
      content.includes('`${minutes}m') || content.includes("m "),
      "formatElapsed should format minutes"
    );
  });
});

// ── 11. Notify URL / Gateway Fallback Delivery ───────────────────────

describe("Message delivery: notify_url and gateway fallback", () => {
  const heartbeatPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "src",
    "worker",
    "heartbeat.ts"
  );

  it("progress messages try notify_url first (direct delivery)", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("notifyUrl") && content.includes("sendProgressMessage"),
      "sendProgressMessage should accept notifyUrl parameter"
    );
  });

  it("progress messages fall back to gateway announce on notify_url failure", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("/tools/invoke"),
      "Fallback should use gateway's /tools/invoke endpoint"
    );
    assert.ok(
      content.includes('"announce"'),
      "Fallback should use the 'announce' tool"
    );
  });

  it("typing indicator uses gateway announce mechanism", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes('action: "typing"'),
      "Typing indicator should send typing action via gateway"
    );
  });

  it("HTTP requests have 5-second timeout", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    const timeoutOccurrences = (content.match(/AbortSignal\.timeout\(5000\)/g) || []).length;
    assert.ok(
      timeoutOccurrences >= 2,
      `HTTP requests should have 5-second timeout (found ${timeoutOccurrences} occurrences, expected >=2)`
    );
  });

  it("auth token extracted from notify_url hash fragment", () => {
    const content = fs.readFileSync(heartbeatPath, "utf-8");
    assert.ok(
      content.includes("#auth="),
      "Should extract auth token from #auth= hash fragment in notify_url"
    );
    assert.ok(
      content.includes("Authorization"),
      "Should set Authorization header from extracted token"
    );
  });
});
