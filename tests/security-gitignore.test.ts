/**
 * Regression test: security-focused .gitignore entries
 *
 * This test verifies that critical security-sensitive file patterns
 * are properly ignored to prevent accidentally committing secrets.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

describe("security-focused .gitignore", () => {
  it("should include .env to prevent committing secrets", async () => {
    const gitignore = await fs.readFile(path.join(REPO_ROOT, ".gitignore"), "utf-8");
    assert.ok(
      gitignore.includes(".env"),
      ".gitignore should include '.env' to prevent committing environment variables with secrets"
    );
  });

  it("should include .env.local for local overrides", async () => {
    const gitignore = await fs.readFile(path.join(REPO_ROOT, ".gitignore"), "utf-8");
    assert.ok(
      gitignore.includes(".env.local"),
      ".gitignore should include '.env.local'"
    );
  });

  it("should include .env.*.local for environment-specific local files", async () => {
    const gitignore = await fs.readFile(path.join(REPO_ROOT, ".gitignore"), "utf-8");
    assert.ok(
      gitignore.includes(".env.*.local"),
      ".gitignore should include '.env.*.local' pattern"
    );
  });

  it("should include *.key for SSH/API keys", async () => {
    const gitignore = await fs.readFile(path.join(REPO_ROOT, ".gitignore"), "utf-8");
    assert.ok(
      gitignore.includes("*.key"),
      ".gitignore should include '*.key' to prevent committing key files"
    );
  });

  it("should include *.pem for certificate files", async () => {
    const gitignore = await fs.readFile(path.join(REPO_ROOT, ".gitignore"), "utf-8");
    assert.ok(
      gitignore.includes("*.pem"),
      ".gitignore should include '*.pem' to prevent committing certificate files"
    );
  });

  it("should include *.secret for secret files", async () => {
    const gitignore = await fs.readFile(path.join(REPO_ROOT, ".gitignore"), "utf-8");
    assert.ok(
      gitignore.includes("*.secret"),
      ".gitignore should include '*.secret' to prevent committing secret files"
    );
  });

  it("should include *.log for log files that may contain sensitive data", async () => {
    const gitignore = await fs.readFile(path.join(REPO_ROOT, ".gitignore"), "utf-8");
    assert.ok(
      gitignore.includes("*.log"),
      ".gitignore should include '*.log' to prevent committing log files"
    );
  });
});

describe("security-focused .env.example", () => {
  it("should exist to document required environment variables", async () => {
    const exists = await fs.access(path.join(REPO_ROOT, ".env.example"))
      .then(() => true)
      .catch(() => false);
    assert.ok(
      exists,
      ".env.example should exist to document required environment variables without exposing actual secrets"
    );
  });

  it("should contain OPENCLAW_GATEWAY_PASSWORD placeholder", async () => {
    const envExample = await fs.readFile(path.join(REPO_ROOT, ".env.example"), "utf-8");
    assert.ok(
      envExample.includes("OPENCLAW_GATEWAY_PASSWORD"),
      ".env.example should document OPENCLAW_GATEWAY_PASSWORD"
    );
  });
});
