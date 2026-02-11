import { getDb } from "./db.js";
import crypto from "node:crypto";

export interface BacklogItem {
  id: string;
  title: string;
  description: string;
  priority: number;
  status: string;
  target_workflow: string | null;
  created_at: string;
  updated_at: string;
}

export function createItem(
  title: string,
  description = "",
  priority?: number
): BacklogItem {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (priority === undefined) {
    const row = db.prepare("SELECT COALESCE(MAX(priority), 0) + 1 AS next FROM backlog_items").get() as { next: number };
    priority = row.next;
  } else {
    // Shift existing items at or after this priority down
    db.exec("UPDATE backlog_items SET priority = priority + 1, updated_at = '" + now + "' WHERE priority >= " + priority);
  }

  db.prepare(
    "INSERT INTO backlog_items (id, title, description, priority, status, target_workflow, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?)"
  ).run(id, title, description, priority, now, now);

  return {
    id,
    title,
    description,
    priority,
    status: "pending",
    target_workflow: null,
    created_at: now,
    updated_at: now,
  };
}

export function getItems(): BacklogItem[] {
  const db = getDb();
  return db.prepare("SELECT * FROM backlog_items ORDER BY priority ASC").all() as unknown as BacklogItem[];
}

export function updateItem(
  id: string,
  updates: Partial<Pick<BacklogItem, "title" | "description" | "priority" | "status" | "target_workflow">>
): BacklogItem | null {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM backlog_items WHERE id = ?").get(id) as unknown as BacklogItem | undefined;
  if (!existing) return null;

  const now = new Date().toISOString();
  const fields: string[] = ["updated_at = ?"];
  const values: (string | number | null)[] = [now];

  if (updates.title !== undefined) { fields.push("title = ?"); values.push(updates.title); }
  if (updates.description !== undefined) { fields.push("description = ?"); values.push(updates.description); }
  if (updates.priority !== undefined) { fields.push("priority = ?"); values.push(updates.priority); }
  if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
  if (updates.target_workflow !== undefined) { fields.push("target_workflow = ?"); values.push(updates.target_workflow); }

  values.push(id);
  db.prepare(`UPDATE backlog_items SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  return db.prepare("SELECT * FROM backlog_items WHERE id = ?").get(id) as unknown as BacklogItem;
}

export function deleteItem(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM backlog_items WHERE id = ?").run(id);
  return result.changes > 0;
}

export function reorderItem(id: string, newPriority: number): BacklogItem | null {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM backlog_items WHERE id = ?").get(id) as unknown as BacklogItem | undefined;
  if (!existing) return null;

  const oldPriority = existing.priority;
  const now = new Date().toISOString();

  if (oldPriority === newPriority) {
    return existing;
  }

  if (newPriority < oldPriority) {
    // Moving up: shift items in [newPriority, oldPriority) down by 1
    db.prepare(
      "UPDATE backlog_items SET priority = priority + 1, updated_at = ? WHERE priority >= ? AND priority < ? AND id != ?"
    ).run(now, newPriority, oldPriority, id);
  } else {
    // Moving down: shift items in (oldPriority, newPriority] up by 1
    db.prepare(
      "UPDATE backlog_items SET priority = priority - 1, updated_at = ? WHERE priority > ? AND priority <= ? AND id != ?"
    ).run(now, oldPriority, newPriority, id);
  }

  db.prepare("UPDATE backlog_items SET priority = ?, updated_at = ? WHERE id = ?").run(newPriority, now, id);
  return db.prepare("SELECT * FROM backlog_items WHERE id = ?").get(id) as unknown as BacklogItem;
}
