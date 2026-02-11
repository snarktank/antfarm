import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createItem, getItems, updateItem, deleteItem, reorderItem } from "../src/backlog.js";
import { getDb } from "../src/db.js";

// ANTFARM_DB_PATH must be set to a temp file before running this test.
// e.g.: ANTFARM_DB_PATH=/tmp/antfarm-test.db node --test dist/tests/backlog.test.js

describe("Backlog CRUD", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM backlog_items");
  });

  it("createItem creates an item with auto-priority", () => {
    const item = createItem("Test task", "A description");
    assert.equal(item.title, "Test task");
    assert.equal(item.description, "A description");
    assert.equal(item.priority, 1);
    assert.equal(item.status, "pending");
    assert.equal(item.target_workflow, null);
    assert.ok(item.id);
    assert.ok(item.created_at);
  });

  it("createItem auto-increments priority", () => {
    const a = createItem("First");
    const b = createItem("Second");
    assert.equal(a.priority, 1);
    assert.equal(b.priority, 2);
  });

  it("createItem with explicit priority shifts others", () => {
    createItem("First");
    createItem("Second");
    const c = createItem("Inserted", "", 1);
    assert.equal(c.priority, 1);
    const items = getItems();
    assert.equal(items.length, 3);
    assert.equal(items[0].title, "Inserted");
    assert.equal(items[1].priority, 2);
    assert.equal(items[2].priority, 3);
  });

  it("getItems returns items ordered by priority", () => {
    createItem("C", "", 3);
    createItem("A", "", 1);
    createItem("B", "", 2);
    const items = getItems();
    assert.deepEqual(items.map((i: any) => i.title), ["A", "B", "C"]);
  });

  it("updateItem updates fields", () => {
    const item = createItem("Original");
    const updated = updateItem(item.id, { title: "Updated", status: "dispatched", target_workflow: "feature-dev" });
    assert.equal(updated!.title, "Updated");
    assert.equal(updated!.status, "dispatched");
    assert.equal(updated!.target_workflow, "feature-dev");
  });

  it("updateItem returns null for nonexistent id", () => {
    const result = updateItem("nonexistent", { title: "x" });
    assert.equal(result, null);
  });

  it("deleteItem removes an item", () => {
    const item = createItem("To delete");
    assert.equal(deleteItem(item.id), true);
    assert.equal(getItems().length, 0);
  });

  it("deleteItem returns false for nonexistent id", () => {
    assert.equal(deleteItem("nonexistent"), false);
  });

  it("reorderItem moves item down (higher priority number)", () => {
    const a = createItem("A");
    createItem("B");
    createItem("C");
    reorderItem(a.id, 3);
    const items = getItems();
    assert.equal(items[0].title, "B");
    assert.equal(items[1].title, "C");
    assert.equal(items[2].title, "A");
  });

  it("reorderItem moves item up (lower priority number)", () => {
    createItem("A");
    createItem("B");
    const c = createItem("C");
    reorderItem(c.id, 1);
    const items = getItems();
    assert.equal(items[0].title, "C");
    assert.equal(items[1].title, "A");
    assert.equal(items[2].title, "B");
  });

  it("reorderItem same position is no-op", () => {
    const a = createItem("A");
    const result = reorderItem(a.id, 1);
    assert.equal(result!.priority, 1);
  });

  it("reorderItem returns null for nonexistent id", () => {
    assert.equal(reorderItem("nonexistent", 1), null);
  });
});
