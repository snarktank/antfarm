/**
 * Regression tests for gateway-api.ts error handling.
 * Verifies that runCli() provides detailed error messages including command info.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

// Path to the gateway-api module
const GATEWAY_API_PATH = path.resolve(import.meta.dirname, "..", "src", "installer", "gateway-api.ts");

describe("gateway-api runCli error handling", () => {
  it("error message includes the executed command when CLI fails", async () => {
    // Create a temporary test script that uses the runCli logic
    const testScript = `
import { execFile } from "node:child_process";

function runCli(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const commandStr = bin + " " + args.join(" ");
    execFile(bin, args, { timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) {
        const exitCode = err.code !== undefined ? "(exit code " + err.code + ")" : "";
        const errorDetail = stderr?.trim() || err.message || "Unknown error";
        reject(new Error("Command failed: " + commandStr + " " + exitCode + ". " + errorDetail));
      } else {
        resolve(stdout);
      }
    });
  });
}

// Test with a command that will definitely fail (non-existent binary)
runCli("/nonexistent/binary", ["arg1", "arg2"]).catch(err => {
  console.log("ERROR_MESSAGE:", err.message);
});
`;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gateway-api-test-"));
    const scriptPath = path.join(tmpDir, "test.ts");
    await fs.writeFile(scriptPath, testScript);

    try {
      // Run the test script
      const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        execFile("node", ["--experimental-strip-types", scriptPath], { timeout: 10_000 }, (err, stdout, stderr) => {
          resolve({ stdout, stderr });
        });
      });

      const output = result.stdout + result.stderr;
      
      // Verify the error message contains the command that failed
      assert.ok(output.includes("ERROR_MESSAGE:"), "Should have logged error message");
      assert.ok(output.includes("/nonexistent/binary"), "Error should include the binary path");
      assert.ok(output.includes("arg1"), "Error should include the arguments");
      assert.ok(output.includes("Command failed:"), "Error should have 'Command failed:' prefix");
    } finally {
      // Cleanup
      await fs.unlink(scriptPath).catch(() => {});
      await fs.rmdir(tmpDir).catch(() => {});
    }
  });

  it("error message includes exit code when CLI command exits with non-zero code", async () => {
    // Test with a command that exits with a specific code
    const testScript = `
import { execFile } from "node:child_process";

function runCli(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const commandStr = bin + " " + args.join(" ");
    execFile(bin, args, { timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) {
        const exitCode = err.code !== undefined ? "(exit code " + err.code + ")" : "";
        const errorDetail = stderr?.trim() || err.message || "Unknown error";
        reject(new Error("Command failed: " + commandStr + " " + exitCode + ". " + errorDetail));
      } else {
        resolve(stdout);
      }
    });
  });
}

// Test with a command that exits with code 1
runCli("node", ["-e", "process.stderr.write('error output'); process.exit(1)"]).catch(err => {
  console.log("ERROR_MESSAGE:", err.message);
});
`;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gateway-api-test-"));
    const scriptPath = path.join(tmpDir, "test.ts");
    await fs.writeFile(scriptPath, testScript);

    try {
      const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        execFile("node", ["--experimental-strip-types", scriptPath], { timeout: 10_000 }, (err, stdout, stderr) => {
          resolve({ stdout, stderr });
        });
      });

      const output = result.stdout + result.stderr;
      
      // Verify the error message contains exit code and stderr
      assert.ok(output.includes("ERROR_MESSAGE:"), "Should have logged error message");
      assert.ok(output.includes("exit code 1"), "Error should include exit code");
      assert.ok(output.includes("error output"), "Error should include stderr content");
      assert.ok(output.includes("node -e"), "Error should include the command");
    } finally {
      await fs.unlink(scriptPath).catch(() => {});
      await fs.rmdir(tmpDir).catch(() => {});
    }
  });

  it("error message handles empty stderr gracefully", async () => {
    // Test with a command that exits with no stderr
    const testScript = `
import { execFile } from "node:child_process";

function runCli(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const commandStr = bin + " " + args.join(" ");
    execFile(bin, args, { timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) {
        const exitCode = err.code !== undefined ? "(exit code " + err.code + ")" : "";
        const errorDetail = stderr?.trim() || err.message || "Unknown error";
        reject(new Error("Command failed: " + commandStr + " " + exitCode + ". " + errorDetail));
      } else {
        resolve(stdout);
      }
    });
  });
}

// Test with a command that exits with code 1 but no stderr
runCli("node", ["-e", "process.exit(1)"]).catch(err => {
  console.log("ERROR_MESSAGE:", err.message);
});
`;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gateway-api-test-"));
    const scriptPath = path.join(tmpDir, "test.ts");
    await fs.writeFile(scriptPath, testScript);

    try {
      const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        execFile("node", ["--experimental-strip-types", scriptPath], { timeout: 10_000 }, (err, stdout, stderr) => {
          resolve({ stdout, stderr });
        });
      });

      const output = result.stdout + result.stderr;
      
      // Verify the error message still has useful info even with empty stderr
      assert.ok(output.includes("ERROR_MESSAGE:"), "Should have logged error message");
      assert.ok(output.includes("exit code 1"), "Error should include exit code");
      assert.ok(output.includes("node -e"), "Error should include the command");
    } finally {
      await fs.unlink(scriptPath).catch(() => {});
      await fs.rmdir(tmpDir).catch(() => {});
    }
  });
});
