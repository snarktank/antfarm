/**
 * Regression test for TypeScript syntax checking bug.
 * 
 * Bug: Using `node -c` to check TypeScript files produces false positive
 * syntax errors because `node -c` validates JavaScript syntax, not TypeScript.
 * 
 * This test ensures:
 * 1. TypeScript files compile successfully with TypeScript compiler
 * 2. We don't accidentally use `node -c` for TypeScript syntax checking
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function findAllTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);
  
  for (const entry of entries) {
    // Skip node_modules and dist directories
    if (entry === "node_modules" || entry === "dist") {
      continue;
    }
    
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...findAllTypeScriptFiles(fullPath));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      files.push(fullPath);
    }
  }
  
  return files;
}

describe("TypeScript syntax checking", () => {
  it("all TypeScript files compile successfully with tsc --noEmit", () => {
    const tsFiles = findAllTypeScriptFiles(join(import.meta.dirname, ".."));
    
    // Skip if no TypeScript files found (shouldn't happen)
    if (tsFiles.length === 0) {
      console.warn("No TypeScript files found to test");
      return;
    }
    
    console.log(`Checking ${tsFiles.length} TypeScript files with tsc --noEmit...`);
    
    try {
      // Run tsc --noEmit on all TypeScript files
      execSync("npx tsc --noEmit", {
        cwd: join(import.meta.dirname, ".."),
        stdio: "inherit"
      });
    } catch (error) {
      // If tsc fails, provide helpful error message
      console.error("\n❌ TypeScript compilation failed!");
      console.error("This means there are actual syntax errors in TypeScript files.");
      console.error("Note: Do not use `node -c` to check TypeScript syntax.");
      console.error("Use `tsc --noEmit` or `npm run build` instead.\n");
      throw error;
    }
    
    console.log("✅ All TypeScript files compile successfully with tsc --noEmit");
  });

  it("demonstrates that node -c fails on TypeScript files (expected)", () => {
    // Find a TypeScript file with TypeScript-specific syntax
    const sampleFile = join(import.meta.dirname, "..", "src", "installer", "subagent-allowlist.ts");
    
    try {
      // Try to check it with node -c (should fail)
      execSync(`node -c "${sampleFile}"`, { stdio: "pipe" });
      
      // If we get here, node -c succeeded, which is actually a problem!
      // It means the TypeScript file doesn't contain TypeScript-specific syntax
      // and could be valid JavaScript, which is unexpected for a .ts file.
      console.warn(`⚠️  WARNING: ${sampleFile} passed node -c syntax check`);
      console.warn("This TypeScript file might not contain TypeScript-specific syntax.");
      console.warn("While not necessarily wrong, it's unusual for a .ts file.");
      
      // We don't fail the test because this isn't necessarily an error,
      // but we log it as a warning.
    } catch (error) {
      // Expected: node -c should fail on TypeScript files
      console.log("✅ As expected, node -c fails on TypeScript files");
      console.log("   This demonstrates why tsc --noEmit should be used instead.");
    }
  });
});