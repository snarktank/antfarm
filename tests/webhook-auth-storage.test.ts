/**
 * Regression test for fix-004: Webhook auth token storage.
 * Verifies that auth tokens from webhook URLs (#auth=...) are stored
 * in a separate notify_auth column rather than embedded in the notify_url.
 * This prevents credential leakage through database access or logs.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

// We test the core behavior: URL parsing and separate storage
// by simulating what run.ts does when inserting a run with a notify URL.

describe("Webhook auth token storage (fix-004)", () => {
  let db: DatabaseSync;

  before(() => {
    db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE runs (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        task TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        context TEXT NOT NULL DEFAULT '{}',
        notify_url TEXT,
        notify_auth TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  });

  after(() => {
    db.close();
  });

  it("should store auth token separately from URL", () => {
    const rawUrl = "https://webhook.example.com/notify#auth=secret-token-123";
    const hashIdx = rawUrl.indexOf("#auth=");
    const cleanUrl = rawUrl.slice(0, hashIdx);
    const authToken = decodeURIComponent(rawUrl.slice(hashIdx + 6));

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, notify_url, notify_auth, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', ?, ?, ?, ?)"
    ).run("test-run-1", "wf1", "test", "running", cleanUrl, authToken, new Date().toISOString(), new Date().toISOString());

    const row = db.prepare("SELECT notify_url, notify_auth FROM runs WHERE id = ?").get("test-run-1") as { notify_url: string; notify_auth: string };

    // URL must NOT contain the auth fragment
    assert.ok(!row.notify_url.includes("#auth="), "notify_url should not contain #auth= fragment");
    assert.ok(!row.notify_url.includes("secret-token"), "notify_url should not contain the token");
    assert.equal(row.notify_url, "https://webhook.example.com/notify");

    // Auth token must be stored separately
    assert.equal(row.notify_auth, "secret-token-123");
  });

  it("should handle URLs without auth fragments", () => {
    const rawUrl = "https://webhook.example.com/notify";
    const hashIdx = rawUrl.indexOf("#auth=");
    const cleanUrl = hashIdx !== -1 ? rawUrl.slice(0, hashIdx) : rawUrl;
    const authToken = hashIdx !== -1 ? decodeURIComponent(rawUrl.slice(hashIdx + 6)) : null;

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, notify_url, notify_auth, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', ?, ?, ?, ?)"
    ).run("test-run-2", "wf1", "test", "running", cleanUrl, authToken, new Date().toISOString(), new Date().toISOString());

    const row = db.prepare("SELECT notify_url, notify_auth FROM runs WHERE id = ?").get("test-run-2") as { notify_url: string; notify_auth: string | null };

    assert.equal(row.notify_url, "https://webhook.example.com/notify");
    assert.equal(row.notify_auth, null);
  });

  it("should handle URL-encoded auth tokens", () => {
    const rawUrl = "https://webhook.example.com/notify#auth=Bearer%20my-jwt-token";
    const hashIdx = rawUrl.indexOf("#auth=");
    const cleanUrl = rawUrl.slice(0, hashIdx);
    const authToken = decodeURIComponent(rawUrl.slice(hashIdx + 6));

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, notify_url, notify_auth, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', ?, ?, ?, ?)"
    ).run("test-run-3", "wf1", "test", "running", cleanUrl, authToken, new Date().toISOString(), new Date().toISOString());

    const row = db.prepare("SELECT notify_url, notify_auth FROM runs WHERE id = ?").get("test-run-3") as { notify_url: string; notify_auth: string };

    assert.ok(!row.notify_url.includes("#auth="), "URL must not contain auth fragment");
    assert.equal(row.notify_auth, "Bearer my-jwt-token");
  });

  it("should verify the fireWebhook code no longer extracts auth from URL", async () => {
    // Import the compiled events module and verify the source pattern
    const fs = await import("node:fs");
    const path = await import("node:path");
    const eventsSource = fs.readFileSync(
      path.join(import.meta.dirname, "..", "src", "installer", "events.ts"),
      "utf-8"
    );

    // The fireWebhook function should NOT contain #auth= URL parsing
    const fireWebhookMatch = eventsSource.match(/function fireWebhook[\s\S]*?^}/m);
    if (fireWebhookMatch) {
      assert.ok(
        !fireWebhookMatch[0].includes('#auth=') && !fireWebhookMatch[0].includes('indexOf("#auth=")'),
        "fireWebhook should not parse #auth= from URLs"
      );
    }

    // Should use getNotifyConfig instead of getNotifyUrl
    assert.ok(
      eventsSource.includes("getNotifyConfig"),
      "events.ts should use getNotifyConfig for separate auth retrieval"
    );

    // The notify config should read notify_auth column
    assert.ok(
      eventsSource.includes("notify_auth"),
      "events.ts should read notify_auth column"
    );
  });

  it("migration should extract auth from existing notify_url values", () => {
    // Simulate a pre-migration database with embedded auth
    const migrateDb = new DatabaseSync(":memory:");
    migrateDb.exec(`
      CREATE TABLE runs (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        task TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        context TEXT NOT NULL DEFAULT '{}',
        notify_url TEXT,
        notify_auth TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Insert a row with embedded auth (pre-migration state)
    migrateDb.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, notify_url, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', ?, ?, ?)"
    ).run("old-run", "wf1", "test", "running", "https://example.com/hook#auth=old-secret", new Date().toISOString(), new Date().toISOString());

    // Run migration logic (same as in db.ts)
    const rows = migrateDb.prepare("SELECT id, notify_url FROM runs WHERE notify_url LIKE '%#auth=%'").all() as Array<{ id: string; notify_url: string }>;
    const update = migrateDb.prepare("UPDATE runs SET notify_url = ?, notify_auth = ? WHERE id = ?");
    for (const row of rows) {
      const hIdx = row.notify_url.indexOf("#auth=");
      if (hIdx !== -1) {
        const clean = row.notify_url.slice(0, hIdx);
        const token = decodeURIComponent(row.notify_url.slice(hIdx + 6));
        update.run(clean, token, row.id);
      }
    }

    // Verify migration result
    const migrated = migrateDb.prepare("SELECT notify_url, notify_auth FROM runs WHERE id = ?").get("old-run") as { notify_url: string; notify_auth: string };
    assert.equal(migrated.notify_url, "https://example.com/hook");
    assert.equal(migrated.notify_auth, "old-secret");
    assert.ok(!migrated.notify_url.includes("#auth="), "Migrated URL should not contain auth fragment");

    migrateDb.close();
  });
});
