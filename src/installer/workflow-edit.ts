import { access, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolveWorkflowDir } from "./paths.js";
import { loadWorkflowSpec } from "./workflow-spec.js";
import { validateWorkflowYaml } from "./workflow-validation.js";
import { createWorkflowBackup, type BackupResult } from "./workflow-backup.js";
import { listBundledWorkflows } from "./workflow-fetch.js";
import { join } from "node:path";

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export interface WorkflowEditResult {
  workflowId: string;
  message: string;
  backup: BackupResult;
  wasModified: boolean;
  validationErrors?: string[];
}

/**
 * Open a workflow's YAML file in the user's default editor for direct modification.
 * Creates backup before editing, validates YAML after editing, and restores backup if validation fails.
 * 
 * @param workflowId - The ID of the workflow to edit
 * @returns Promise<WorkflowEditResult> - Contains edit results and backup information
 */
export async function editWorkflow(workflowId: string): Promise<WorkflowEditResult> {
  // Validate workflow exists
  const bundledWorkflows = await listBundledWorkflows();
  if (!bundledWorkflows.includes(workflowId)) {
    const available = bundledWorkflows.length > 0 ? bundledWorkflows.join(", ") : "none";
    throw new Error(`Workflow "${workflowId}" not found. Available workflows: ${available}`);
  }

  const workflowDir = resolveWorkflowDir(workflowId);
  const workflowPath = join(workflowDir, "workflow.yml");

  // Ensure workflow is properly installed locally (copy from bundled if needed)
  if (!(await pathExists(workflowDir))) {
    const { installWorkflow } = await import("./install.js");
    await installWorkflow({ workflowId });
  }

  // Validate workflow spec before editing
  try {
    await loadWorkflowSpec(workflowDir);
  } catch (error) {
    throw new Error(`Workflow "${workflowId}" has invalid spec: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Create backup before editing
  const backup = await createWorkflowBackup(workflowId);

  // Read current content for comparison
  const originalContent = await readFile(workflowPath, "utf-8");

  // Determine editor to use
  const editor = process.env.EDITOR || process.env.VISUAL || "nano";

  try {
    // Open editor
    await openEditor(editor, workflowPath);

    // Read modified content
    const modifiedContent = await readFile(workflowPath, "utf-8");
    const wasModified = originalContent !== modifiedContent;

    if (!wasModified) {
      return {
        workflowId,
        message: `No changes made to workflow "${workflowId}"`,
        backup,
        wasModified: false
      };
    }

    // Validate modified YAML
    const validationResult = validateWorkflowYaml(modifiedContent);
    
    if (!validationResult.valid) {
      // Restore backup on validation failure
      await writeFile(workflowPath, originalContent, "utf-8");
      
      const errorMessages = validationResult.errors.map(e => e.message);
      return {
        workflowId,
        message: `Validation failed. Changes reverted. Backup preserved at: ${backup.backupPath}`,
        backup,
        wasModified: true,
        validationErrors: errorMessages
      };
    }

    // Validate that the modified workflow can still be loaded
    try {
      await loadWorkflowSpec(workflowDir);
    } catch (error) {
      // Restore backup on spec loading failure
      await writeFile(workflowPath, originalContent, "utf-8");
      
      return {
        workflowId,
        message: `Workflow spec validation failed. Changes reverted. Backup preserved at: ${backup.backupPath}`,
        backup,
        wasModified: true,
        validationErrors: [`Spec loading error: ${error instanceof Error ? error.message : String(error)}`]
      };
    }

    return {
      workflowId,
      message: `Successfully edited workflow "${workflowId}". Backup created at: ${backup.backupPath}`,
      backup,
      wasModified: true
    };

  } catch (error) {
    // Restore backup on any editor or processing error
    await writeFile(workflowPath, originalContent, "utf-8");
    
    if (error instanceof EditorCancelledException) {
      return {
        workflowId,
        message: `Edit cancelled. No changes made to workflow "${workflowId}"`,
        backup,
        wasModified: false
      };
    }

    throw new Error(`Error editing workflow: ${error instanceof Error ? error.message : String(error)}`);
  }
}

class EditorCancelledException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditorCancelledException";
  }
}

/**
 * Open an editor process and wait for it to complete
 * @param editor - Editor command to run
 * @param filePath - Path to file to edit
 */
function openEditor(editor: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Split editor command to handle editors with arguments
    const editorParts = editor.split(/\s+/);
    const command = editorParts[0];
    const args = [...editorParts.slice(1), filePath];

    const child = spawn(command, args, {
      stdio: "inherit", // Pass through stdin/stdout/stderr to allow interactive editing
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else if (code === 1 || code === 130) {
        // Common exit codes for editor cancellation (Ctrl+C)
        reject(new EditorCancelledException("Editor was cancelled by user"));
      } else {
        reject(new Error(`Editor exited with code ${code}`));
      }
    });

    child.on("error", (error) => {
      if ((error as any).code === "ENOENT") {
        reject(new Error(`Editor "${command}" not found. Make sure it's installed and in your PATH, or set EDITOR environment variable.`));
      } else {
        reject(new Error(`Failed to start editor: ${error.message}`));
      }
    });
  });
}