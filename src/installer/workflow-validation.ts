import YAML from "yaml";
import type { WorkflowSpec, WorkflowAgent, WorkflowStep } from "./types.js";

export interface ValidationError {
  field?: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  parsedWorkflow?: WorkflowSpec;
}

/**
 * Validates YAML syntax and workflow specification structure
 * @param yamlContent Raw YAML content as string
 * @returns Validation result with detailed error messages
 */
export function validateWorkflowYaml(yamlContent: string): ValidationResult {
  const errors: ValidationError[] = [];

  // Step 1: Validate YAML syntax
  let parsed: any;
  try {
    parsed = YAML.parse(yamlContent);
  } catch (error) {
    return {
      valid: false,
      errors: [{
        code: "YAML_SYNTAX_ERROR",
        message: `Invalid YAML syntax: ${error instanceof Error ? error.message : String(error)}`
      }]
    };
  }

  // Step 2: Check if parsed result is an object
  if (!parsed || typeof parsed !== 'object') {
    return {
      valid: false,
      errors: [{
        code: "INVALID_STRUCTURE",
        message: "Workflow YAML must be an object"
      }]
    };
  }

  // Step 3: Validate required fields
  validateRequiredFields(parsed, errors);

  // Step 4: Validate workflow structure regardless of basic field errors
  // (but only if we have the minimum structure to avoid crashes)
  if (parsed.agents && Array.isArray(parsed.agents) && parsed.steps && Array.isArray(parsed.steps)) {
    validateWorkflowStructure(parsed as WorkflowSpec, errors);
  }

  return {
    valid: errors.length === 0,
    errors,
    parsedWorkflow: errors.length === 0 ? parsed as WorkflowSpec : undefined
  };
}

/**
 * Validates that all required top-level fields are present
 */
function validateRequiredFields(parsed: any, errors: ValidationError[]): void {
  const requiredFields = ['id', 'name', 'agents', 'steps'];
  
  for (const field of requiredFields) {
    if (!(field in parsed)) {
      errors.push({
        field,
        code: "MISSING_REQUIRED_FIELD",
        message: `Missing required field: ${field}`
      });
    }
  }

  // Validate id format
  if (parsed.id !== undefined) {
    if (!parsed.id || typeof parsed.id !== 'string' || !parsed.id.trim()) {
      errors.push({
        field: "id",
        code: "INVALID_ID",
        message: "Field 'id' must be a non-empty string"
      });
    } else if (parsed.id.includes("_")) {
      errors.push({
        field: "id",
        code: "INVALID_ID_FORMAT",
        message: "Field 'id' must not contain underscores"
      });
    }
  }

  // Validate name
  if (parsed.name !== undefined && (!parsed.name || typeof parsed.name !== 'string' || !parsed.name.trim())) {
    errors.push({
      field: "name",
      code: "INVALID_NAME",
      message: "Field 'name' must be a non-empty string"
    });
  }

  // Validate agents is array
  if (parsed.agents !== undefined && (!Array.isArray(parsed.agents) || parsed.agents.length === 0)) {
    errors.push({
      field: "agents",
      code: "INVALID_AGENTS",
      message: "Field 'agents' must be a non-empty array"
    });
  }

  // Validate steps is array
  if (parsed.steps !== undefined && (!Array.isArray(parsed.steps) || parsed.steps.length === 0)) {
    errors.push({
      field: "steps",
      code: "INVALID_STEPS",
      message: "Field 'steps' must be a non-empty array"
    });
  }
}

/**
 * Validates the detailed structure of agents and steps
 */
function validateWorkflowStructure(workflow: WorkflowSpec, errors: ValidationError[]): void {
  // Validate agents
  const agentIds = new Set<string>();
  for (let i = 0; i < workflow.agents.length; i++) {
    const agent = workflow.agents[i];
    validateAgent(agent, i, agentIds, errors);
  }

  // Validate steps and agent references
  const stepIds = new Set<string>();
  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    validateStep(step, i, stepIds, agentIds, errors);
  }

  // Validate step references in loop configs
  validateStepReferences(workflow.steps, stepIds, errors);
}

/**
 * Validates individual agent configuration
 */
function validateAgent(agent: WorkflowAgent, index: number, agentIds: Set<string>, errors: ValidationError[]): void {
  const prefix = `agents[${index}]`;

  // Validate agent id
  if (!agent.id || typeof agent.id !== 'string' || !agent.id.trim()) {
    errors.push({
      field: `${prefix}.id`,
      code: "INVALID_AGENT_ID",
      message: `Agent at index ${index} must have a non-empty id`
    });
  } else {
    if (agent.id.includes("_")) {
      errors.push({
        field: `${prefix}.id`,
        code: "INVALID_AGENT_ID_FORMAT",
        message: `Agent "${agent.id}" must not contain underscores (reserved as namespace separator)`
      });
    }
    if (agentIds.has(agent.id)) {
      errors.push({
        field: `${prefix}.id`,
        code: "DUPLICATE_AGENT_ID",
        message: `Duplicate agent id: "${agent.id}"`
      });
    } else {
      agentIds.add(agent.id);
    }
  }

  // Validate workspace
  if (!agent.workspace) {
    errors.push({
      field: `${prefix}.workspace`,
      code: "MISSING_WORKSPACE",
      message: `Agent "${agent.id}" must have a workspace configuration`
    });
  } else {
    if (!agent.workspace.baseDir || typeof agent.workspace.baseDir !== 'string' || !agent.workspace.baseDir.trim()) {
      errors.push({
        field: `${prefix}.workspace.baseDir`,
        code: "INVALID_BASE_DIR",
        message: `Agent "${agent.id}" workspace must have a non-empty baseDir`
      });
    }

    if (!agent.workspace.files || typeof agent.workspace.files !== 'object' || Object.keys(agent.workspace.files).length === 0) {
      errors.push({
        field: `${prefix}.workspace.files`,
        code: "INVALID_WORKSPACE_FILES",
        message: `Agent "${agent.id}" workspace must have at least one file`
      });
    }

    if (agent.workspace.skills && !Array.isArray(agent.workspace.skills)) {
      errors.push({
        field: `${prefix}.workspace.skills`,
        code: "INVALID_SKILLS",
        message: `Agent "${agent.id}" workspace.skills must be an array if provided`
      });
    }
  }

  // Validate timeout
  if (agent.timeoutSeconds !== undefined && (typeof agent.timeoutSeconds !== 'number' || agent.timeoutSeconds <= 0)) {
    errors.push({
      field: `${prefix}.timeoutSeconds`,
      code: "INVALID_TIMEOUT",
      message: `Agent "${agent.id}" timeoutSeconds must be a positive number`
    });
  }
}

/**
 * Validates individual step configuration
 */
function validateStep(step: WorkflowStep, index: number, stepIds: Set<string>, agentIds: Set<string>, errors: ValidationError[]): void {
  const prefix = `steps[${index}]`;

  // Validate step id
  if (!step.id || typeof step.id !== 'string' || !step.id.trim()) {
    errors.push({
      field: `${prefix}.id`,
      code: "INVALID_STEP_ID",
      message: `Step at index ${index} must have a non-empty id`
    });
  } else {
    if (stepIds.has(step.id)) {
      errors.push({
        field: `${prefix}.id`,
        code: "DUPLICATE_STEP_ID",
        message: `Duplicate step id: "${step.id}"`
      });
    } else {
      stepIds.add(step.id);
    }
  }

  // Validate agent reference
  if (!step.agent || typeof step.agent !== 'string' || !step.agent.trim()) {
    errors.push({
      field: `${prefix}.agent`,
      code: "INVALID_STEP_AGENT",
      message: `Step "${step.id}" must reference an agent`
    });
  } else if (!agentIds.has(step.agent)) {
    errors.push({
      field: `${prefix}.agent`,
      code: "UNKNOWN_AGENT_REFERENCE",
      message: `Step "${step.id}" references unknown agent: "${step.agent}"`
    });
  }

  // Validate input
  if (!step.input || typeof step.input !== 'string' || !step.input.trim()) {
    errors.push({
      field: `${prefix}.input`,
      code: "INVALID_STEP_INPUT",
      message: `Step "${step.id}" must have non-empty input`
    });
  }

  // Validate expects
  if (!step.expects || typeof step.expects !== 'string' || !step.expects.trim()) {
    errors.push({
      field: `${prefix}.expects`,
      code: "INVALID_STEP_EXPECTS",
      message: `Step "${step.id}" must have non-empty expects`
    });
  }

  // Validate loop configuration if present
  if (step.type === "loop") {
    if (!step.loop) {
      errors.push({
        field: `${prefix}.loop`,
        code: "MISSING_LOOP_CONFIG",
        message: `Step "${step.id}" has type=loop but no loop configuration`
      });
    } else {
      if (step.loop.over !== "stories") {
        errors.push({
          field: `${prefix}.loop.over`,
          code: "INVALID_LOOP_OVER",
          message: `Step "${step.id}" loop.over must be "stories"`
        });
      }
      if (step.loop.completion !== "all_done") {
        errors.push({
          field: `${prefix}.loop.completion`,
          code: "INVALID_LOOP_COMPLETION",
          message: `Step "${step.id}" loop.completion must be "all_done"`
        });
      }
    }
  }
}

/**
 * Validates step references in loop configurations
 */
function validateStepReferences(steps: WorkflowStep[], stepIds: Set<string>, errors: ValidationError[]): void {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.type === "loop" && step.loop?.verifyEach && step.loop?.verifyStep) {
      if (!stepIds.has(step.loop.verifyStep)) {
        errors.push({
          field: `steps[${i}].loop.verifyStep`,
          code: "UNKNOWN_STEP_REFERENCE",
          message: `Step "${step.id}" loop.verifyStep references unknown step: "${step.loop.verifyStep}"`
        });
      }
    }
  }
}