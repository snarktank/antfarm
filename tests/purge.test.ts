import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPurgeFilter } from "../dist/installer/purge.js";

test("buildPurgeFilter with status filter", () => {
  const result = buildPurgeFilter({ status: "cancelled" });
  assert.strictEqual(result, "WHERE status = ?");
});

test("buildPurgeFilter with olderThanDays filter", () => {
  const result = buildPurgeFilter({ olderThanDays: 7 });
  assert.strictEqual(result, 'WHERE created_at < datetime("now", "-7 days")');
});

test("buildPurgeFilter with both status and olderThanDays filters", () => {
  const result = buildPurgeFilter({ status: "cancelled", olderThanDays: 7 });
  assert.strictEqual(
    result,
    'WHERE status = ? AND created_at < datetime("now", "-7 days")'
  );
});

test("buildPurgeFilter with empty filters returns empty string", () => {
  const result = buildPurgeFilter({});
  assert.strictEqual(result, "");
});

test("buildPurgeFilter with different olderThanDays values", () => {
  const result = buildPurgeFilter({ olderThanDays: 30 });
  assert.strictEqual(result, 'WHERE created_at < datetime("now", "-30 days")');
});

test("buildPurgeFilter with undefined olderThanDays is excluded", () => {
  const result = buildPurgeFilter({ status: "cancelled", olderThanDays: undefined });
  assert.strictEqual(result, "WHERE status = ?");
});

test("buildPurgeFilter with completed status", () => {
  const result = buildPurgeFilter({ status: "completed" });
  assert.strictEqual(result, "WHERE status = ?");
});
