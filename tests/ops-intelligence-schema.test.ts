import { test } from "node:test";
import assert from "node:assert";
import { getDb } from "../src/db.ts";

test("Ops Intelligence Module database schema - tables are created", async () => {
  const db = getDb();
  
  // Test that all the new tables exist
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'ops_*'").all();
  
  const tableNames = tables.map((t: any) => t.name);
  assert.ok(tableNames.includes("ops_metrics"), "ops_metrics table should exist");
  assert.ok(tableNames.includes("ops_alerts"), "ops_alerts table should exist");
  assert.ok(tableNames.includes("ops_system_logs"), "ops_system_logs table should exist");
});

test("Ops Intelligence Module database schema - ops_metrics table structure", async () => {
  const db = getDb();
  
  const columns = db.prepare("PRAGMA table_info(ops_metrics)").all();
  const columnNames = columns.map((c: any) => c.name);
  
  assert.ok(columnNames.includes("id"), "ops_metrics should have id column");
  assert.ok(columnNames.includes("timestamp"), "ops_metrics should have timestamp column");
  assert.ok(columnNames.includes("metric_type"), "ops_metrics should have metric_type column");
  assert.ok(columnNames.includes("value"), "ops_metrics should have value column");
  assert.ok(columnNames.includes("unit"), "ops_metrics should have unit column");
  assert.ok(columnNames.includes("tags"), "ops_metrics should have tags column");
  assert.ok(columnNames.includes("created_at"), "ops_metrics should have created_at column");
  assert.ok(columnNames.includes("updated_at"), "ops_metrics should have updated_at column");
});

test("Ops Intelligence Module database schema - ops_alerts table structure", async () => {
  const db = getDb();
  
  const columns = db.prepare("PRAGMA table_info(ops_alerts)").all();
  const columnNames = columns.map((c: any) => c.name);
  
  assert.ok(columnNames.includes("id"), "ops_alerts should have id column");
  assert.ok(columnNames.includes("alert_type"), "ops_alerts should have alert_type column");
  assert.ok(columnNames.includes("severity"), "ops_alerts should have severity column");
  assert.ok(columnNames.includes("title"), "ops_alerts should have title column");
  assert.ok(columnNames.includes("message"), "ops_alerts should have message column");
  assert.ok(columnNames.includes("status"), "ops_alerts should have status column");
  assert.ok(columnNames.includes("created_at"), "ops_alerts should have created_at column");
  assert.ok(columnNames.includes("updated_at"), "ops_alerts should have updated_at column");
  assert.ok(columnNames.includes("resolved_at"), "ops_alerts should have resolved_at column");
  assert.ok(columnNames.includes("source"), "ops_alerts should have source column");
});

test("Ops Intelligence Module database schema - ops_system_logs table structure", async () => {
  const db = getDb();
  
  const columns = db.prepare("PRAGMA table_info(ops_system_logs)").all();
  const columnNames = columns.map((c: any) => c.name);
  
  assert.ok(columnNames.includes("id"), "ops_system_logs should have id column");
  assert.ok(columnNames.includes("timestamp"), "ops_system_logs should have timestamp column");
  assert.ok(columnNames.includes("log_level"), "ops_system_logs should have log_level column");
  assert.ok(columnNames.includes("message"), "ops_system_logs should have message column");
  assert.ok(columnNames.includes("source"), "ops_system_logs should have source column");
  assert.ok(columnNames.includes("metadata"), "ops_system_logs should have metadata column");
  assert.ok(columnNames.includes("created_at"), "ops_system_logs should have created_at column");
  assert.ok(columnNames.includes("updated_at"), "ops_system_logs should have updated_at column");
});

test("Ops Intelligence Module database schema - indexes are created", async () => {
  const db = getDb();
  
  // Test that all the new indexes exist
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name GLOB 'idx_ops_*'").all();
  const indexNames = indexes.map((i: any) => i.name);
  
  assert.ok(indexNames.includes("idx_ops_metrics_timestamp"), "idx_ops_metrics_timestamp index should exist");
  assert.ok(indexNames.includes("idx_ops_metrics_type"), "idx_ops_metrics_type index should exist");
  assert.ok(indexNames.includes("idx_ops_alerts_severity"), "idx_ops_alerts_severity index should exist");
  assert.ok(indexNames.includes("idx_ops_alerts_status"), "idx_ops_alerts_status index should exist");
  assert.ok(indexNames.includes("idx_ops_alerts_type"), "idx_ops_alerts_type index should exist");
  assert.ok(indexNames.includes("idx_ops_system_logs_timestamp"), "idx_ops_system_logs_timestamp index should exist");
  assert.ok(indexNames.includes("idx_ops_system_logs_level"), "idx_ops_system_logs_level index should exist");
  assert.ok(indexNames.includes("idx_ops_system_logs_source"), "idx_ops_system_logs_source index should exist");
});

test("Ops Intelligence Module database schema - relationships are defined", async () => {
  const db = getDb();
  
  // This test checks that the existing relationships are maintained 
  // (the new tables don't have foreign keys since they are standalone)
  // but we're verifying the schema is correctly defined
  const patternsTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ops_patterns'").get();
  const findingsTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ops_findings'").get();
  
  assert.ok(patternsTableExists, "ops_patterns table should exist");
  assert.ok(findingsTableExists, "ops_findings table should exist");
});