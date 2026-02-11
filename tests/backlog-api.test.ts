import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startDashboard } from "../src/server/dashboard.js";
import { getDb } from "../src/db.js";

const PORT = 9876;
let server: http.Server;

function req(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "localhost",
      port: PORT,
      path,
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
    };
    const r = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode!, data: JSON.parse(text) });
      });
    });
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

describe("Backlog API", () => {
  before(() => {
    // Ensure DB is initialized
    getDb();
    server = startDashboard(PORT);
  });

  after(() => {
    server.close();
  });

  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM backlog_items");
  });

  it("GET /api/backlog returns empty array", async () => {
    const { status, data } = await req("GET", "/api/backlog");
    assert.equal(status, 200);
    assert.deepEqual(data, []);
  });

  it("POST /api/backlog creates an item", async () => {
    const { status, data } = await req("POST", "/api/backlog", {
      title: "Test task",
      description: "A test",
    });
    assert.equal(status, 201);
    assert.equal(data.title, "Test task");
    assert.equal(data.description, "A test");
    assert.equal(data.status, "pending");
  });

  it("POST /api/backlog with target_workflow", async () => {
    const { data } = await req("POST", "/api/backlog", {
      title: "WF task",
      target_workflow: "feature-dev",
    });
    assert.equal(data.target_workflow, "feature-dev");
  });

  it("POST /api/backlog without title returns 400", async () => {
    const { status } = await req("POST", "/api/backlog", { description: "no title" });
    assert.equal(status, 400);
  });

  it("GET /api/backlog returns items ordered by priority", async () => {
    await req("POST", "/api/backlog", { title: "First" });
    await req("POST", "/api/backlog", { title: "Second" });
    const { data } = await req("GET", "/api/backlog");
    assert.equal(data.length, 2);
    assert.equal(data[0].title, "First");
    assert.equal(data[1].title, "Second");
    assert.ok(data[0].priority < data[1].priority);
  });

  it("PATCH /api/backlog/:id updates item", async () => {
    const { data: created } = await req("POST", "/api/backlog", { title: "Original" });
    const { status, data } = await req("PATCH", `/api/backlog/${created.id}`, {
      title: "Updated",
    });
    assert.equal(status, 200);
    assert.equal(data.title, "Updated");
  });

  it("PATCH /api/backlog/:id returns 404 for missing", async () => {
    const { status } = await req("PATCH", "/api/backlog/nonexistent", { title: "X" });
    assert.equal(status, 404);
  });

  it("DELETE /api/backlog/:id deletes item", async () => {
    const { data: created } = await req("POST", "/api/backlog", { title: "To delete" });
    const { status, data } = await req("DELETE", `/api/backlog/${created.id}`);
    assert.equal(status, 200);
    assert.deepEqual(data, { ok: true });
    // Verify gone
    const { data: items } = await req("GET", "/api/backlog");
    assert.equal(items.length, 0);
  });

  it("DELETE /api/backlog/:id returns 404 for missing", async () => {
    const { status } = await req("DELETE", "/api/backlog/nonexistent");
    assert.equal(status, 404);
  });

  it("POST /api/backlog/:id/reorder changes priority", async () => {
    const { data: a } = await req("POST", "/api/backlog", { title: "A" });
    await req("POST", "/api/backlog", { title: "B" });
    const { status, data } = await req("POST", `/api/backlog/${a.id}/reorder`, {
      priority: 2,
    });
    assert.equal(status, 200);
    assert.equal(data.priority, 2);
  });

  it("POST /api/backlog/:id/reorder returns 400 without priority", async () => {
    const { data: a } = await req("POST", "/api/backlog", { title: "A" });
    const { status } = await req("POST", `/api/backlog/${a.id}/reorder`, {});
    assert.equal(status, 400);
  });

  it("POST /api/backlog/:id/reorder returns 404 for missing", async () => {
    const { status } = await req("POST", "/api/backlog/nonexistent/reorder", {
      priority: 1,
    });
    assert.equal(status, 404);
  });

  it("POST /api/backlog/:id/dispatch returns 400 without target_workflow", async () => {
    const { data: created } = await req("POST", "/api/backlog", { title: "No WF" });
    const { status, data } = await req("POST", `/api/backlog/${created.id}/dispatch`, {});
    assert.equal(status, 400);
    assert.match(data.error, /target_workflow/);
  });

  it("POST /api/backlog/:id/dispatch returns 400 for invalid workflow", async () => {
    const { data: created } = await req("POST", "/api/backlog", {
      title: "Bad WF",
      target_workflow: "nonexistent-workflow-xyz",
    });
    const { status, data } = await req("POST", `/api/backlog/${created.id}/dispatch`, {});
    assert.equal(status, 400);
    assert.match(data.error, /invalid workflow/);
  });

  it("POST /api/backlog/:id/dispatch returns 404 for missing item", async () => {
    const { status } = await req("POST", "/api/backlog/nonexistent/dispatch", {});
    assert.equal(status, 404);
  });

  it("POST /api/backlog with invalid JSON returns 400", async () => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "localhost",
        port: PORT,
        path: "/api/backlog",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      };
      const r = http.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          assert.equal(res.statusCode, 400);
          resolve(undefined);
        });
      });
      r.on("error", reject);
      r.write("not json{{{");
      r.end();
    });
  });
});
