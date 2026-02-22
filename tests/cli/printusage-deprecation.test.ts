import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("printUsage deprecation", () => {
  it("cli.ts should not contain printUsage function", () => {
    const cliPath = join(__dirname, "..", "..", "src", "cli", "cli.ts");
    const cliSource = readFileSync(cliPath, "utf-8");
    
    // Verify printUsage function definition is not present
    assert.ok(
      !cliSource.includes("function printUsage"),
      "printUsage function should be removed"
    );
    assert.ok(
      !cliSource.includes("const printUsage"),
      "printUsage const should be removed"
    );
  });

  it("cli.ts should not call printUsage", () => {
    const cliPath = join(__dirname, "..", "..", "src", "cli", "cli.ts");
    const cliSource = readFileSync(cliPath, "utf-8");
    
    // Verify no calls to printUsage()
    assert.ok(
      !cliSource.includes("printUsage()"),
      "printUsage() calls should be replaced with printHelp()"
    );
  });

  it("cli.ts imports printHelp from help.ts", () => {
    const cliPath = join(__dirname, "..", "..", "src", "cli", "cli.ts");
    const cliSource = readFileSync(cliPath, "utf-8");
    
    // Verify printHelp is imported from help.ts
    assert.ok(
      cliSource.includes('from "./help.js"') || cliSource.includes("from './help.js'"),
      "Should import from help.ts"
    );
    assert.ok(
      cliSource.includes("printHelp"),
      "Should import printHelp"
    );
  });

  it("cli.ts uses printHelp for help display", () => {
    const cliPath = join(__dirname, "..", "..", "src", "cli", "cli.ts");
    const cliSource = readFileSync(cliPath, "utf-8");
    
    // Verify printHelp() is called
    assert.ok(
      cliSource.includes("printHelp()"),
      "Should use printHelp() instead of printUsage()"
    );
  });

  it("all help-related imports are from help.ts module", () => {
    const cliPath = join(__dirname, "..", "..", "src", "cli", "cli.ts");
    const cliSource = readFileSync(cliPath, "utf-8");
    
    // Verify all specialized help functions are imported
    const helpFunctions = [
      "printHelp",
      "printCommandHelp",
      "printWorkflowHelp",
      "printDashboardHelp",
      "printStepHelp",
      "printMedicHelp",
      "printLogsHelp"
    ];
    
    for (const fn of helpFunctions) {
      assert.ok(
        cliSource.includes(fn),
        `Should import ${fn} from help.ts`
      );
    }
  });
});
