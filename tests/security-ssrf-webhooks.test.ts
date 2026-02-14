import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

// Mock HOME before importing anything that uses it
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-test-ssrf-"));
process.env.HOME = tempHome;

// Now import
import { emitEvent } from "../dist/installer/events.js";
import { getDb } from "../dist/db.js";

describe("Webhook SSRF Protection", () => {
  let originalFetch: typeof fetch;
  let fetchCalls: string[] = [];

  before(() => {
    originalFetch = global.fetch;
    // @ts-ignore
    global.fetch = (async (url: any, options: any) => {
      fetchCalls.push(url.toString());
      return new Response("ok");
    }) as any;
  });

  after(() => {
    global.fetch = originalFetch;
    try {
      fs.rmSync(tempHome, { recursive: true, force: true });
    } catch {}
  });

  it("should block SSRF attempts to localhost", async () => {
    fetchCalls = [];
    const runId = crypto.randomUUID();
    const db = getDb();
    db.prepare("INSERT INTO runs (id, workflow_id, task, status, created_at, updated_at, notify_url) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(runId, "test-wf", "test-task", "running", new Date().toISOString(), new Date().toISOString(), "http://localhost:8080/webhook");

    emitEvent({
      ts: new Date().toISOString(),
      event: "run.started",
      runId: runId
    });

    assert.equal(fetchCalls.length, 0, "Fetch should not have been called for localhost");
  });

  it("should block SSRF attempts to private IP ranges", async () => {
    const privateUrls = [
      "http://127.0.0.1/hit",
      "http://10.0.0.1/hit",
      "http://172.16.0.1/hit",
      "http://192.168.1.1/hit",
      "http://169.254.169.254/latest/meta-data/"
    ];

    for (const url of privateUrls) {
      fetchCalls = [];
      const runId = crypto.randomUUID();
      const db = getDb();
      db.prepare("INSERT INTO runs (id, workflow_id, task, status, created_at, updated_at, notify_url) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(runId, "test-wf", "test-task", "running", new Date().toISOString(), new Date().toISOString(), url);

      emitEvent({
        ts: new Date().toISOString(),
        event: "run.started",
        runId: runId
      });

      assert.equal(fetchCalls.length, 0, `Fetch should not have been called for ${url}`);
    }
  });

  it("should allow safe public URLs", async () => {
    fetchCalls = [];
    const runId = crypto.randomUUID();
    const db = getDb();
    const safeUrl = "https://hooks.slack.com/services/T000/B000/XXXX";
    db.prepare("INSERT INTO runs (id, workflow_id, task, status, created_at, updated_at, notify_url) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(runId, "test-wf", "test-task", "running", new Date().toISOString(), new Date().toISOString(), safeUrl);

    emitEvent({
      ts: new Date().toISOString(),
      event: "run.started",
      runId: runId
    });

    assert.equal(fetchCalls.length, 1, "Fetch should have been called for public URL");
    assert.equal(fetchCalls[0], safeUrl);
  });
});
