import { describe, it, mock } from "node:test";
import assert from "node:assert";
import { printHelp, printCommandHelp } from "../../dist/cli/help.js";

describe("help module", () => {
  describe("printHelp", () => {
    it("should output general help text without errors", () => {
      // Capture stdout
      const originalWrite = process.stdout.write;
      let output = "";
      process.stdout.write = ((chunk: string) => {
        output += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printHelp();
        
        // Verify key sections are present
        assert.ok(output.includes("Antfarm"), "Should include Antfarm title");
        assert.ok(output.includes("USAGE:"), "Should include usage section");
        assert.ok(output.includes("COMMANDS:"), "Should include commands section");
        assert.ok(output.includes("COMMON WORKFLOWS:"), "Should include common workflows");
        
        // Verify all major commands are listed
        assert.ok(output.includes("install"), "Should list install command");
        assert.ok(output.includes("uninstall"), "Should list uninstall command");
        assert.ok(output.includes("workflow"), "Should list workflow command");
        assert.ok(output.includes("dashboard"), "Should list dashboard command");
        assert.ok(output.includes("step"), "Should list step command");
        assert.ok(output.includes("medic"), "Should list medic command");
        assert.ok(output.includes("logs"), "Should list logs command");
        assert.ok(output.includes("version"), "Should list version command");
      } finally {
        process.stdout.write = originalWrite;
      }
    });

    it("should include workflow management section", () => {
      const originalWrite = process.stdout.write;
      let output = "";
      process.stdout.write = ((chunk: string) => {
        output += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printHelp();
        assert.ok(output.includes("Workflow Management:"), "Should have workflow management section");
      } finally {
        process.stdout.write = originalWrite;
      }
    });

    it("should include monitoring & control section", () => {
      const originalWrite = process.stdout.write;
      let output = "";
      process.stdout.write = ((chunk: string) => {
        output += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printHelp();
        assert.ok(output.includes("Monitoring & Control:"), "Should have monitoring section");
      } finally {
        process.stdout.write = originalWrite;
      }
    });

    it("should include common workflow examples", () => {
      const originalWrite = process.stdout.write;
      let output = "";
      process.stdout.write = ((chunk: string) => {
        output += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printHelp();
        assert.ok(output.includes("Get started:"), "Should include getting started examples");
        assert.ok(output.includes("Monitor workflow:"), "Should include monitoring examples");
        assert.ok(output.includes("Troubleshooting:"), "Should include troubleshooting examples");
      } finally {
        process.stdout.write = originalWrite;
      }
    });
  });

  describe("printCommandHelp", () => {
    it("should output help for install command", () => {
      const originalWrite = process.stdout.write;
      let output = "";
      process.stdout.write = ((chunk: string) => {
        output += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printCommandHelp("install");
        assert.ok(output.includes("INSTALL"), "Should include command name");
        assert.ok(output.includes("Install all bundled workflows"), "Should include description");
        assert.ok(output.includes("USAGE:"), "Should include usage");
        assert.ok(output.includes("antfarm install"), "Should show command usage");
      } finally {
        process.stdout.write = originalWrite;
      }
    });

    it("should output help for workflow command with subcommands", () => {
      const originalWrite = process.stdout.write;
      let output = "";
      process.stdout.write = ((chunk: string) => {
        output += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printCommandHelp("workflow");
        assert.ok(output.includes("WORKFLOW"), "Should include command name");
        assert.ok(output.includes("SUBCOMMANDS:"), "Should include subcommands section");
        assert.ok(output.includes("list"), "Should list 'list' subcommand");
        assert.ok(output.includes("run"), "Should list 'run' subcommand");
        assert.ok(output.includes("status"), "Should list 'status' subcommand");
        assert.ok(output.includes("EXAMPLES:"), "Should include examples");
      } finally {
        process.stdout.write = originalWrite;
      }
    });

    it("should output help for dashboard command", () => {
      const originalWrite = process.stdout.write;
      let output = "";
      process.stdout.write = ((chunk: string) => {
        output += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printCommandHelp("dashboard");
        assert.ok(output.includes("DASHBOARD"), "Should include command name");
        assert.ok(output.includes("Control the web dashboard daemon"), "Should include description");
        assert.ok(output.includes("start"), "Should list start subcommand");
        assert.ok(output.includes("stop"), "Should list stop subcommand");
        assert.ok(output.includes("status"), "Should list status subcommand");
      } finally {
        process.stdout.write = originalWrite;
      }
    });

    it("should output help for step command", () => {
      const originalWrite = process.stdout.write;
      let output = "";
      process.stdout.write = ((chunk: string) => {
        output += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printCommandHelp("step");
        assert.ok(output.includes("STEP"), "Should include command name");
        assert.ok(output.includes("peek"), "Should list peek subcommand");
        assert.ok(output.includes("claim"), "Should list claim subcommand");
        assert.ok(output.includes("complete"), "Should list complete subcommand");
        assert.ok(output.includes("fail"), "Should list fail subcommand");
        assert.ok(output.includes("stories"), "Should list stories subcommand");
      } finally {
        process.stdout.write = originalWrite;
      }
    });

    it("should output help for medic command", () => {
      const originalWrite = process.stdout.write;
      let output = "";
      process.stdout.write = ((chunk: string) => {
        output += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printCommandHelp("medic");
        assert.ok(output.includes("MEDIC"), "Should include command name");
        assert.ok(output.includes("Watchdog service"), "Should include description");
        assert.ok(output.includes("install"), "Should list install subcommand");
        assert.ok(output.includes("run"), "Should list run subcommand");
        assert.ok(output.includes("status"), "Should list status subcommand");
      } finally {
        process.stdout.write = originalWrite;
      }
    });

    it("should output help for logs command", () => {
      const originalWrite = process.stdout.write;
      let output = "";
      process.stdout.write = ((chunk: string) => {
        output += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printCommandHelp("logs");
        assert.ok(output.includes("LOGS"), "Should include command name");
        assert.ok(output.includes("Show recent activity"), "Should include description");
        assert.ok(output.includes("EXAMPLES:"), "Should include examples");
      } finally {
        process.stdout.write = originalWrite;
      }
    });

    it("should handle unknown command gracefully", () => {
      const originalStdoutWrite = process.stdout.write;
      const originalStderrWrite = process.stderr.write;
      let stdoutOutput = "";
      let stderrOutput = "";
      
      process.stdout.write = ((chunk: string) => {
        stdoutOutput += chunk;
        return true;
      }) as typeof process.stdout.write;
      
      process.stderr.write = ((chunk: string) => {
        stderrOutput += chunk;
        return true;
      }) as typeof process.stderr.write;

      try {
        printCommandHelp("nonexistent");
        assert.ok(stderrOutput.includes("Unknown command: nonexistent"), "Should show error for unknown command");
        assert.ok(stdoutOutput.includes("Antfarm"), "Should fall back to general help");
      } finally {
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
      }
    });

    it("should include usage patterns for all commands", () => {
      const commands = ["install", "uninstall", "workflow", "dashboard", "step", "medic", "logs"];
      
      for (const cmd of commands) {
        const originalWrite = process.stdout.write;
        let output = "";
        process.stdout.write = ((chunk: string) => {
          output += chunk;
          return true;
        }) as typeof process.stdout.write;

        try {
          printCommandHelp(cmd);
          assert.ok(output.includes("USAGE:"), `${cmd} should include usage section`);
          assert.ok(output.includes(`antfarm ${cmd}`), `${cmd} should show command usage`);
        } finally {
          process.stdout.write = originalWrite;
        }
      }
    });
  });

  describe("command definitions", () => {
    it("should have examples for workflow command", () => {
      const originalWrite = process.stdout.write;
      let output = "";
      process.stdout.write = ((chunk: string) => {
        output += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printCommandHelp("workflow");
        assert.ok(output.includes("feature-dev"), "Should include workflow example");
        assert.ok(output.includes("workflow run"), "Should show run example");
        assert.ok(output.includes("workflow status"), "Should show status example");
      } finally {
        process.stdout.write = originalWrite;
      }
    });

    it("should have examples for logs command", () => {
      const originalWrite = process.stdout.write;
      let output = "";
      process.stdout.write = ((chunk: string) => {
        output += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printCommandHelp("logs");
        assert.ok(output.includes("Show last"), "Should include example descriptions");
        assert.ok(output.includes("antfarm logs"), "Should show logs command examples");
      } finally {
        process.stdout.write = originalWrite;
      }
    });
  });
});
