import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const CLI_PATH = join(process.cwd(), "dist", "cli", "cli.js");

function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("node", [CLI_PATH, ...args], { 
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"]
  });
  
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.status || 0
  };
}

test("antfarm --help shows main usage with exit code 0", () => {
  const result = runCli(["--help"]);
  
  assert.equal(result.exitCode, 0, "Help command should exit with code 0");
  assert(result.stdout.includes("Antfarm - Workflow automation with AI agents"));
  assert(result.stdout.includes("USAGE:"));
  assert(result.stdout.includes("antfarm workflow list"));
  assert(result.stdout.includes("antfarm workflow run"));
  assert(result.stdout.includes("Use --help with any command for detailed documentation"));
});

test("antfarm help shows main usage", () => {
  const result = runCli(["help"]);
  
  assert.equal(result.exitCode, 0);
  assert(result.stdout.includes("Antfarm - Workflow automation"));
  assert(result.stdout.includes("WORKFLOW MANAGEMENT:"));
});

test("antfarm -h shows main usage", () => {
  const result = runCli(["-h"]);
  
  assert.equal(result.exitCode, 0);
  assert(result.stdout.includes("Antfarm - Workflow automation"));
});

test("antfarm without arguments shows main usage", () => {
  const result = runCli([]);
  
  assert.equal(result.exitCode, 0);
  assert(result.stdout.includes("Antfarm - Workflow automation"));
});

test("antfarm workflow --help shows workflow commands with exit code 0", () => {
  const result = runCli(["workflow", "--help"]);
  
  assert.equal(result.exitCode, 0, "Workflow help should exit with code 0");
  assert(result.stdout.includes("Workflow Management Commands"));
  assert(result.stdout.includes("DISCOVERY & INFORMATION:"));
  assert(result.stdout.includes("LIFECYCLE MANAGEMENT:"));
  assert(result.stdout.includes("IMPORT/EXPORT/COPY:"));
  assert(result.stdout.includes("EXECUTION:"));
  assert(result.stdout.includes("EXAMPLES:"));
  assert(result.stdout.includes("antfarm workflow list"));
  assert(result.stdout.includes("antfarm workflow run feature-dev"));
});

test("antfarm workflow help shows workflow commands", () => {
  const result = runCli(["workflow", "help"]);
  
  assert.equal(result.exitCode, 0);
  assert(result.stdout.includes("Workflow Management Commands"));
});

test("antfarm workflow without action shows workflow usage", () => {
  const result = runCli(["workflow"]);
  
  assert.equal(result.exitCode, 0);
  assert(result.stdout.includes("Workflow Management Commands"));
});

test("antfarm workflow run --help shows detailed run command help", () => {
  const result = runCli(["workflow", "run", "--help"]);
  
  assert.equal(result.exitCode, 0, "Run help should exit with code 0");
  assert(result.stdout.includes("Start a workflow run"));
  assert(result.stdout.includes("USAGE:"));
  assert(result.stdout.includes("ARGUMENTS:"));
  assert(result.stdout.includes("OPTIONS:"));
  assert(result.stdout.includes("EXAMPLES:"));
  assert(result.stdout.includes("TASK DESCRIPTION TIPS:"));
  assert(result.stdout.includes("antfarm workflow run feature-dev"));
  assert(result.stdout.includes("--notify-url"));
});

test("antfarm workflow export --help shows detailed export command help", () => {
  const result = runCli(["workflow", "export", "--help"]);
  
  assert.equal(result.exitCode, 0);
  assert(result.stdout.includes("Export workflow YAML configuration"));
  assert(result.stdout.includes("--output <file>"));
  assert(result.stdout.includes("EXAMPLES:"));
  assert(result.stdout.includes("OUTPUT FORMAT:"));
  assert(result.stdout.includes("USE CASES:"));
  assert(result.stdout.includes("antfarm workflow export feature-dev"));
});

test("antfarm workflow import --help shows detailed import command help", () => {
  const result = runCli(["workflow", "import", "--help"]);
  
  assert.equal(result.exitCode, 0);
  assert(result.stdout.includes("Import workflow from YAML file"));
  assert(result.stdout.includes("--overwrite"));
  assert(result.stdout.includes("VALIDATION:"));
  assert(result.stdout.includes("WORKFLOW STRUCTURE:"));
  assert(result.stdout.includes("CONFLICT HANDLING:"));
  assert(result.stdout.includes("antfarm workflow import my-workflow.yml"));
});

test("workflow run without arguments shows error and help", () => {
  const result = runCli(["workflow", "run"]);
  
  assert.equal(result.exitCode, 0, "Should show help instead of exiting with error");
  assert(result.stderr.includes("Missing workflow name and task"), `Expected error message in stderr. Got: ${JSON.stringify(result.stderr)}`);
  assert(result.stdout.includes("Start a workflow run"), `Expected help text in stdout. Got: ${JSON.stringify(result.stdout.substring(0, 100))}`);
});

test("workflow export without arguments shows error and help", () => {
  const result = runCli(["workflow", "export"]);
  
  assert.equal(result.exitCode, 0, "Should show help instead of exiting with error"); 
  assert(result.stderr.includes("Missing workflow name"), `Expected error message in stderr. Got: ${JSON.stringify(result.stderr)}`);
  assert(result.stdout.includes("Export workflow YAML configuration"), `Expected help text in stdout. Got: ${JSON.stringify(result.stdout.substring(0, 100))}`);
});

test("workflow import without arguments shows error and help", () => {
  const result = runCli(["workflow", "import"]);
  
  assert.equal(result.exitCode, 0, "Should show help instead of exiting with error");
  assert(result.stderr.includes("Missing YAML file path"), `Expected error message in stderr. Got: ${JSON.stringify(result.stderr)}`);
  assert(result.stdout.includes("Import workflow from YAML file"), `Expected help text in stdout. Got: ${JSON.stringify(result.stdout.substring(0, 100))}`);
});

test("help text includes practical examples", () => {
  const workflowHelp = runCli(["workflow", "--help"]);
  const runHelp = runCli(["workflow", "run", "--help"]);
  const exportHelp = runCli(["workflow", "export", "--help"]);
  
  // Check workflow help has examples
  assert(workflowHelp.stdout.includes("EXAMPLES:"));
  assert(workflowHelp.stdout.includes("antfarm workflow run feature-dev \"Add login\""));
  assert(workflowHelp.stdout.includes("# Start feature development"));
  
  // Check run help has examples  
  assert(runHelp.stdout.includes("EXAMPLES:"));
  assert(runHelp.stdout.includes("antfarm workflow run feature-dev \"Implement user authentication\""));
  assert(runHelp.stdout.includes("antfarm workflow run bug-fix"));
  
  // Check export help has examples
  assert(exportHelp.stdout.includes("EXAMPLES:"));
  assert(exportHelp.stdout.includes("antfarm workflow export feature-dev"));
  assert(exportHelp.stdout.includes("--output my-bug-fix.yml"));
});

test("help text follows consistent patterns", () => {
  const mainHelp = runCli(["--help"]);
  const workflowHelp = runCli(["workflow", "--help"]);
  const runHelp = runCli(["workflow", "run", "--help"]);
  
  // All help text should have USAGE sections
  assert(mainHelp.stdout.includes("USAGE:"));
  assert(workflowHelp.stdout.includes("USAGE:"));
  assert(runHelp.stdout.includes("USAGE:"));
  
  // Command-specific help should have EXAMPLES
  assert(workflowHelp.stdout.includes("EXAMPLES:"));
  assert(runHelp.stdout.includes("EXAMPLES:"));
  
  // All should end with related commands or helpful info
  assert(workflowHelp.stdout.includes("Related commands:") || workflowHelp.stdout.includes("Use --help"));
  assert(runHelp.stdout.includes("Related commands:"));
});

test("help command shows all new edit/delete commands with descriptions", () => {
  const help = runCli(["--help"]);
  
  // Check all new commands are present with descriptions
  assert(help.stdout.includes("antfarm workflow show"));
  assert(help.stdout.includes("antfarm workflow edit"));
  assert(help.stdout.includes("antfarm workflow export"));
  assert(help.stdout.includes("antfarm workflow import"));
  assert(help.stdout.includes("antfarm workflow copy"));
  assert(help.stdout.includes("antfarm workflow rename"));
  assert(help.stdout.includes("antfarm workflow delete"));
  
  // Check descriptions are present
  assert(help.stdout.includes("Show detailed workflow configuration"));
  assert(help.stdout.includes("Edit workflow YAML in your default editor"));
  assert(help.stdout.includes("Export workflow YAML to stdout"));
  assert(help.stdout.includes("Import workflow from YAML file"));
  assert(help.stdout.includes("Copy existing workflow with new ID"));
  assert(help.stdout.includes("Rename workflow ID and update internal references"));
  assert(help.stdout.includes("Delete a workflow"));
});

test("workflow help shows detailed command usage", () => {
  const help = runCli(["workflow", "--help"]);
  
  // Should show organized sections
  assert(help.stdout.includes("DISCOVERY & INFORMATION:"));
  assert(help.stdout.includes("LIFECYCLE MANAGEMENT:"));
  assert(help.stdout.includes("IMPORT/EXPORT/COPY:"));
  assert(help.stdout.includes("EDITING:"));
  assert(help.stdout.includes("EXECUTION:"));
  assert(help.stdout.includes("MAINTENANCE:"));
  
  // Should show detailed descriptions with flags
  assert(help.stdout.includes("--output <file>"));
  assert(help.stdout.includes("--overwrite"));
  assert(help.stdout.includes("--force"));
  assert(help.stdout.includes("--notify-url"));
});

test("individual command help includes syntax details", () => {
  const runHelp = runCli(["workflow", "run", "--help"]);
  const exportHelp = runCli(["workflow", "export", "--help"]);
  const importHelp = runCli(["workflow", "import", "--help"]);
  
  // Run command details
  assert(runHelp.stdout.includes("ARGUMENTS:"));
  assert(runHelp.stdout.includes("<name>    Workflow ID to run"));
  assert(runHelp.stdout.includes("<task>    Task description"));
  assert(runHelp.stdout.includes("OPTIONS:"));
  assert(runHelp.stdout.includes("--notify-url <url>"));
  
  // Export command details
  assert(exportHelp.stdout.includes("ARGUMENTS:"));
  assert(exportHelp.stdout.includes("<name>    Workflow ID to export"));
  assert(exportHelp.stdout.includes("--output <file>"));
  
  // Import command details
  assert(importHelp.stdout.includes("ARGUMENTS:"));
  assert(importHelp.stdout.includes("<file>    Path to YAML workflow file"));
  assert(importHelp.stdout.includes("--overwrite"));
});

test("all workflow management commands support --help flag", () => {
  // Test show command help
  const showHelp = runCli(["workflow", "show", "--help"]);
  assert.equal(showHelp.exitCode, 0);
  assert(showHelp.stdout.includes("Show detailed workflow configuration"));
  assert(showHelp.stdout.includes("USAGE:"));
  assert(showHelp.stdout.includes("EXAMPLES:"));
  assert(showHelp.stdout.includes("INFORMATION DISPLAYED:"));
  
  // Test edit command help
  const editHelp = runCli(["workflow", "edit", "--help"]);
  assert.equal(editHelp.exitCode, 0);
  assert(editHelp.stdout.includes("Edit workflow YAML in your default editor"));
  assert(editHelp.stdout.includes("EDITOR SELECTION:"));
  assert(editHelp.stdout.includes("SAFETY FEATURES:"));
  
  // Test copy command help
  const copyHelp = runCli(["workflow", "copy", "--help"]);
  assert.equal(copyHelp.exitCode, 0);
  assert(copyHelp.stdout.includes("Copy existing workflow with new ID"));
  assert(copyHelp.stdout.includes("WORKFLOW ID RULES:"));
  assert(copyHelp.stdout.includes("WHAT GETS COPIED:"));
  
  // Test rename command help
  const renameHelp = runCli(["workflow", "rename", "--help"]);
  assert.equal(renameHelp.exitCode, 0);
  assert(renameHelp.stdout.includes("Rename workflow ID and update internal references"));
  assert(renameHelp.stdout.includes("WHAT GETS UPDATED:"));
  assert(renameHelp.stdout.includes("SAFETY CHECKS:"));
  
  // Test delete command help
  const deleteHelp = runCli(["workflow", "delete", "--help"]);
  assert.equal(deleteHelp.exitCode, 0);
  assert(deleteHelp.stdout.includes("Delete workflow with automatic backup"));
  assert(deleteHelp.stdout.includes("SAFETY FEATURES:"));
  assert(deleteHelp.stdout.includes("WHAT GETS REMOVED:"));
});

test("help commands include practical examples for common operations", () => {
  const showHelp = runCli(["workflow", "show", "--help"]);
  const editHelp = runCli(["workflow", "edit", "--help"]);
  const copyHelp = runCli(["workflow", "copy", "--help"]);
  const renameHelp = runCli(["workflow", "rename", "--help"]);
  const deleteHelp = runCli(["workflow", "delete", "--help"]);
  
  // Check all help commands have examples sections
  assert(showHelp.stdout.includes("EXAMPLES:"));
  assert(editHelp.stdout.includes("EXAMPLES:"));
  assert(copyHelp.stdout.includes("EXAMPLES:"));
  assert(renameHelp.stdout.includes("EXAMPLES:"));
  assert(deleteHelp.stdout.includes("EXAMPLES:"));
  
  // Check examples include realistic workflows
  assert(showHelp.stdout.includes("feature-dev"));
  assert(copyHelp.stdout.includes("antfarm workflow copy feature-dev my-feature"));
  assert(renameHelp.stdout.includes("user-auth-feature"));
  assert(deleteHelp.stdout.includes("--force"));
});

test("help commands show consistent structure and formatting", () => {
  const commands = ["show", "edit", "copy", "rename", "delete"];
  
  for (const cmd of commands) {
    const help = runCli(["workflow", cmd, "--help"]);
    assert.equal(help.exitCode, 0, `${cmd} help should exit with code 0`);
    assert(help.stdout.includes("USAGE:"), `${cmd} help should have USAGE section`);
    assert(help.stdout.includes("ARGUMENTS:"), `${cmd} help should have ARGUMENTS section`);
    assert(help.stdout.includes("OPTIONS:"), `${cmd} help should have OPTIONS section`);
    assert(help.stdout.includes("EXAMPLES:"), `${cmd} help should have EXAMPLES section`);
    assert(help.stdout.includes("Related commands:"), `${cmd} help should have Related commands section`);
  }
});

test("commands without arguments show error and help", () => {
  const commands = ["show", "edit", "copy", "rename", "delete"];
  
  for (const cmd of commands) {
    const result = runCli(["workflow", cmd]);
    assert.equal(result.exitCode, 0, `${cmd} without args should show help (exit 0)`);
    assert(result.stderr.includes("Missing"), `${cmd} should show missing argument error`);
    assert(result.stdout.includes("USAGE:"), `${cmd} should show usage help`);
  }
});