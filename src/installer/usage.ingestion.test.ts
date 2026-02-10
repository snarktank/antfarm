import { after, before, describe, test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-usage-ingest-"));
const dbPath = path.join(tmpRoot, "antfarm-test.db");
const agentsDir = path.join(tmpRoot, "agents");

let usageModule: typeof import("./usage.js");
let dbModule: typeof import("../db.js");

describe("usage ingestion from OpenClaw session JSONL", () => {
  before(async () => {
    process.env.ANTFARM_DB_PATH = dbPath;
    process.env.OPENCLAW_AGENTS_DIR = agentsDir;

    fs.mkdirSync(path.join(agentsDir, "real-agent", "sessions"), { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, "real-agent", "sessions", "session-1.jsonl"),
      [
        JSON.stringify({ type: "session_start", timestamp: "2026-02-01T12:00:00.000Z" }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-02-01T12:10:00.000Z",
          model: "claude-sonnet-4-5",
          usage: {
            input_tokens: 111,
            output_tokens: 222,
            cache_read_tokens: 10,
            cache_write_tokens: 11,
          },
          cost: { total: 0.1234 },
        }),
      ].join("\n") + "\n",
      "utf-8",
    );

    dbModule = await import("../db.js");
    usageModule = await import("./usage.js");

    usageModule.insertUsage({
      agentId: "test-log-agent-0",
      model: "gpt-4o",
      inputTokens: 999,
      outputTokens: 999,
      costUsd: 9.99,
      taskLabel: "fixture",
    });
  });

  after(() => {
    try {
      dbModule.getDb().close();
    } catch {}

    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process.env.ANTFARM_DB_PATH;
    delete process.env.OPENCLAW_AGENTS_DIR;
  });

  test("clears stale usage rows and imports real message usage from JSONL", () => {
    const result = usageModule.ingestUsageFromSessions();
    assert.strictEqual(result.filesScanned, 1);
    assert.strictEqual(result.imported, 1);

    const log = usageModule.getUsageLog({ limit: 10, offset: 0 });
    assert.strictEqual(log.total, 1);

    const row = log.records[0];
    assert.strictEqual(row.agentId, "real-agent");
    assert.strictEqual(row.model, "claude-sonnet-4-5");
    assert.strictEqual(row.inputTokens, 111);
    assert.strictEqual(row.outputTokens, 222);
    assert.strictEqual(row.cacheReadTokens, 10);
    assert.strictEqual(row.cacheWriteTokens, 11);
    assert.strictEqual(row.costUsd, 0.1234);
    assert.ok(row.sourceKey);
    assert.ok(!log.records.some((r: any) => r.agentId === "test-log-agent-0"));
  });
});
