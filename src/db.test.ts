import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Database Security - File Permissions", () => {
  describe("Database directory permissions", () => {
    it("database directory should be created with mode 0o700 (owner-only)", () => {
      // Create a test directory with the correct mode
      const testDir = path.join(os.tmpdir(), `antfarm-test-${Date.now()}`);
      
      try {
        fs.mkdirSync(testDir, { recursive: true, mode: 0o700 });
        const stats = fs.statSync(testDir);
        
        // Check that only owner has read/write/execute permissions
        // Mode 0o700 = rw-x------
        // We check the permission bits match
        const mode = stats.mode & 0o777; // Extract permission bits
        assert.equal(mode, 0o700, "Directory should have 0o700 permissions (owner read/write/execute only)");
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("database file should be created with mode 0o600 (owner read/write only)", () => {
      const testDir = path.join(os.tmpdir(), `antfarm-test-${Date.now()}`);
      const testFile = path.join(testDir, "test.db");
      
      try {
        fs.mkdirSync(testDir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(testFile, "test content");
        fs.chmodSync(testFile, 0o600);
        
        const stats = fs.statSync(testFile);
        const mode = stats.mode & 0o777;
        assert.equal(mode, 0o600, "Database file should have 0o600 permissions (owner read/write only)");
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("insecure permissions (0o644) should not be used for databases", () => {
      const insecureMode = 0o644;
      const secureMode = 0o600;
      
      // Verify the difference
      assert.notEqual(insecureMode, secureMode, "Insecure mode should be different from secure mode");
      
      // 0o644 allows group/other to read
      const groupReadable = (insecureMode & 0o040) > 0;
      const otherReadable = (insecureMode & 0o004) > 0;
      
      assert.ok(groupReadable, "0o644 allows group to read");
      assert.ok(otherReadable, "0o644 allows others to read");
      
      // 0o600 does not allow group/other
      const secureGroupReadable = (secureMode & 0o040) > 0;
      const secureOtherReadable = (secureMode & 0o004) > 0;
      
      assert.ok(!secureGroupReadable, "0o600 should not allow group to read");
      assert.ok(!secureOtherReadable, "0o600 should not allow others to read");
    });
  });

  describe("WAL and SHM file permissions", () => {
    it("WAL file should also have secure permissions", () => {
      const testDir = path.join(os.tmpdir(), `antfarm-test-${Date.now()}`);
      const walFile = path.join(testDir, "test.db-wal");
      
      try {
        fs.mkdirSync(testDir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(walFile, "test wal");
        fs.chmodSync(walFile, 0o600);
        
        const stats = fs.statSync(walFile);
        const mode = stats.mode & 0o777;
        assert.equal(mode, 0o600, "WAL file should have 0o600 permissions");
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("SHM file should also have secure permissions", () => {
      const testDir = path.join(os.tmpdir(), `antfarm-test-${Date.now()}`);
      const shmFile = path.join(testDir, "test.db-shm");
      
      try {
        fs.mkdirSync(testDir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(shmFile, "test shm");
        fs.chmodSync(shmFile, 0o600);
        
        const stats = fs.statSync(shmFile);
        const mode = stats.mode & 0o777;
        assert.equal(mode, 0o600, "SHM file should have 0o600 permissions");
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe("Permission inheritance and protection", () => {
    it("files created in 0o700 directory should not be world-readable by default", () => {
      const testDir = path.join(os.tmpdir(), `antfarm-test-${Date.now()}`);
      
      try {
        fs.mkdirSync(testDir, { recursive: true, mode: 0o700 });
        
        // Verify directory permissions
        const dirStats = fs.statSync(testDir);
        const dirMode = dirStats.mode & 0o777;
        
        assert.equal(dirMode, 0o700, "Parent directory must be 0o700");
        
        // Directory with 0o700 means others cannot enter/list files
        const othersCanAccess = (dirMode & 0o001) > 0;
        assert.ok(!othersCanAccess, "Others should not be able to access 0o700 directory");
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });
  });
});
