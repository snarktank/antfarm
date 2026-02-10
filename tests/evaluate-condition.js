/**
 * Condition evaluation logic for workflow steps.
 * Extracted for testing purposes.
 */

/**
 * Resolve {{key}} placeholders in a template against a context object.
 * Supports keys with hyphens, dots, and alphanumeric characters.
 */
function resolveTemplate(template, context) {
  return template.replace(/\{\{([\w\-]+(?:\.[\w\-]+)*)\}\}/g, (_match, key) => {
    if (key in context) return context[key];
    const lower = key.toLowerCase();
    if (lower in context) return context[lower];
    return `[missing: ${key}]`;
  });
}

/**
 * Evaluate a condition expression against the run context.
 * Supports: {{key}} variable substitution, ==, !=, &&, ||, comparisons to [] and ""
 * Examples:
 *   "{{steps.check-idle.IDLE_AGENTS}} != []"
 *   "{{steps.check-idle.IDLE_AGENTS}} != [] && {{steps.check-repos.REPO_TASKS_AVAILABLE}} != []"
 */
export function evaluateCondition(condition, context) {
  // First resolve all {{variable}} placeholders
  let resolved = resolveTemplate(condition, context);

  // Handle [missing: key] as falsy/empty
  resolved = resolved.replace(/\[missing: [^\]]+\]/g, '[]');

  // Tokenize while preserving string literals and operators
  const tokens = [];
  let current = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < resolved.length; i++) {
    const char = resolved[i];

    if (!inString && (char === '"' || char === "'")) {
      if (current.trim()) tokens.push(current.trim());
      inString = true;
      stringChar = char;
      current = char;
    } else if (inString && char === stringChar) {
      current += char;
      tokens.push(current);
      inString = false;
      current = '';
    } else if (!inString) {
      // Check for two-char operators
      const twoChar = resolved.slice(i, i + 2);
      if (twoChar === '==' || twoChar === '!=') {
        if (current.trim()) tokens.push(current.trim());
        tokens.push(twoChar);
        current = '';
        i++; // skip next char
      } else if (char === '&' && resolved[i + 1] === '&') {
        if (current.trim()) tokens.push(current.trim());
        tokens.push('&&');
        current = '';
        i++;
      } else if (char === '|' && resolved[i + 1] === '|') {
        if (current.trim()) tokens.push(current.trim());
        tokens.push('||');
        current = '';
        i++;
      } else if (char === ' ') {
        if (current.trim()) tokens.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    } else {
      current += char;
    }
  }
  if (current.trim()) tokens.push(current.trim());

  // Parse tokens into expression
  function parseExpression(index) {
    const left = parseComparison(index);
    let i = left.nextIndex;

    while (i < tokens.length) {
      const token = tokens[i];
      if (token === '&&') {
        const right = parseExpression(i + 1);
        return {
          expr: { type: 'and', left: left.expr, right: right.expr },
          nextIndex: right.nextIndex
        };
      } else if (token === '||') {
        const right = parseExpression(i + 1);
        return {
          expr: { type: 'or', left: left.expr, right: right.expr },
          nextIndex: right.nextIndex
        };
      } else {
        break;
      }
    }

    return left;
  }

  function parseComparison(index) {
    if (index >= tokens.length) {
      return { expr: { type: 'compare', value: true }, nextIndex: index };
    }

    const leftVal = tokens[index];

    if (index + 2 < tokens.length && (tokens[index + 1] === '==' || tokens[index + 1] === '!=')) {
      const op = tokens[index + 1];
      const rightVal = tokens[index + 2];
      return {
        expr: { type: 'compare', op, leftVal, rightVal },
        nextIndex: index + 3
      };
    }

    // Single value - truthy check (not equal to empty)
    return {
      expr: { type: 'compare', op: '!=', leftVal, rightVal: '[]' },
      nextIndex: index + 1
    };
  }

  function normalizeValue(val) {
    if (val === undefined || val === null) return '';
    // Strip surrounding quotes from string values
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      return val.slice(1, -1);
    }
    return val;
  }

  function evaluate(expr) {
    switch (expr.type) {
      case 'compare':
        if (expr.value !== undefined) return expr.value;
        const left = normalizeValue(expr.leftVal ?? '');
        const right = normalizeValue(expr.rightVal ?? '');
        const isLeftEmpty = left === '[]' || left === '';
        const isRightEmpty = right === '[]' || right === '';

        if (expr.op === '==') {
          return isLeftEmpty === isRightEmpty && (isLeftEmpty || left === right);
        } else if (expr.op === '!=') {
          return isLeftEmpty !== isRightEmpty || (!isLeftEmpty && left !== right);
        }
        return false;
      case 'and':
        return evaluate(expr.left) && evaluate(expr.right);
      case 'or':
        return evaluate(expr.left) || evaluate(expr.right);
      default:
        return false;
    }
  }

  try {
    const parsed = parseExpression(0);
    return evaluate(parsed.expr);
  } catch {
    return false;
  }
}
