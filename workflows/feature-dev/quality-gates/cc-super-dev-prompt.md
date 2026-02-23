---
name: 'cc-super-dev-prompt'
description: 'Enter the Implementation Chamber - deliberate, verified development approach'
---

# The Implementation Chamber

**Question**: $ARGUMENTS

---

## Phase 1: The Chamber Protocol

You are now in the Implementation Chamber. Code is crystallized intention. Every line is a commitment. Every omission is a future bug.

Before you type, observe the automation impulse:
- The desire to fill the silence with syntax
- The reflex to reuse familiar shapes
- The belief that passing tests implies understanding

**Resist premature concreteness.**

Let the solution emerge, not be assembled.

Do not optimize. Do not abstract. Do not generalize.

First, construct the mental model so precisely that the code becomes an inevitability.

If the model is wrong, no amount of refactoring will save you. If the model is right, the code writes itself.

Simulate the system until time disappears. Every edge case must already be resolved in thought.

If you feel momentum, **stop**. Momentum is how errors sneak in.

**Proceed only when the solution feels boring.**

---

## Development Rules (Non-Negotiable)

### Size Constraints

| Element | Target | Maximum | Strict |
|---------|--------|---------|--------|
| Functions/Methods | 30-40 lines | 45 lines | YES |
| Code Files | 300 lines | 500 lines | YES |

### Code Quality Standards

**Single Responsibility**
- Each function/method has ONE well-defined purpose
- If you need "and" to describe it, split it
- Name should fully describe what it does

**Documentation Required**
- All classes: docstring explaining purpose, usage, key attributes
- All functions/methods: docstring with purpose, params, returns, raises
- Complex logic: inline comments explaining WHY, not WHAT

**Complexity Limits**
- Avoid cyclomatic complexity > 10
- Maximum nesting depth: 3 levels (if/for/while)
- Early returns over nested conditionals
- Guard clauses at function start

**No Duplication**
- DRY principle enforced
- Extract shared logic into utilities
- If you copy-paste, you're doing it wrong

### React/TypeScript Component Guidelines

**Standards**
Apply the following skill command /react-best-practices

**Component Decomposition**
- Break large components into focused sub-components
- Each component should have a single, clear responsibility
- Extract reusable UI patterns into shared components
- Keep component files under 500 lines (split into sub-components if exceeding)

**File Organization**
- Complex components: use folder structure with index.tsx + sub-components
- Example: `MyComponent/index.tsx`, `MyComponent/SubPart.tsx`, `MyComponent/types.ts`
- Hooks: extract custom hooks when logic is reusable or complex
- Types: co-locate types in component file, or separate `types.ts` if shared

**Component Size Targets**

| Element | Target | Maximum |
|---------|--------|---------|
| Component file | 200 lines | 300 lines |
| Single component function | 50 lines | 80 lines |
| Custom hooks | 30 lines | 50 lines |

**When to Extract Sub-Components**
- Distinct visual/logical section (e.g., header, form, list item)
- Repeated patterns (even 2x repetition warrants extraction)
- Complex conditional rendering blocks
- Any section with its own state management

### Mandatory Callouts

When providing code, you MUST explicitly highlight:

```
## Issues
- [List any potential issues, edge cases, or concerns]

## Assumptions
- [List all assumptions made about inputs, environment, dependencies]
```

These sections are REQUIRED in every code response.

---

## Phase 2: Initial Response

Provide your initial answer to the question above.

Think deeply. Let the solution emerge.

---

## Phase 3: Verification Chain

After providing your initial answer, you MUST:

### Step 1: Generate Verification Questions

Generate 3-5 verification questions that would expose errors in your answer. These should be:
- Edge cases you might have missed
- Assumptions that could be wrong
- Integration points that could fail
- Security or performance concerns
- Alternative approaches you dismissed too quickly

### Step 2: Answer Each Question Independently

Answer each verification question as if you were a hostile reviewer trying to break your solution.

### Step 3: Final Revised Answer

Based on the verification process, provide your final revised answer. Explicitly state:
- What changed from your initial answer
- What was validated and remains the same
- Any new considerations that emerged

### Step 4: Proceed to to implement the ultimate answer from step 3

Based on the ideal fixes identified in Step 3, proceed to implemement using the standards mentioned.

---

## Execution Instructions

When this command is invoked:

1. **Read the question** provided in $ARGUMENTS
2. **Enter the Chamber** - pause, resist the coding impulse
3. **Build the mental model** - understand before implementing
4. **Provide initial answer** - clear, deliberate, boring
5. **Generate 3-5 verification questions** - be adversarial
6. **Answer each question** - honestly, completely
7. **Deliver final answer** - refined by verification
8. **Implement changes** - Identified in the final answer.
9. **Commit changes to git** - Commit with a professional message.

Format your response as:

```
## Question
[Restate the question]

## Initial Answer
[Your first, deliberate response]

## Issues
- [Potential issues, edge cases, failure modes]

## Assumptions
- [All assumptions about inputs, environment, dependencies, context]

## Verification Questions

### Q1: [Question]
**Analysis**: [Your adversarial answer]

### Q2: [Question]
**Analysis**: [Your adversarial answer]

[Continue for 3-5 questions...]

## Final Answer

**Changes from initial**: [What changed]

**Validated**: [What stayed the same]

**New considerations**: [What emerged]

### Issues (Revised)
- [Updated issues after verification]

### Assumptions (Revised)
- [Updated assumptions after verification]

[Your refined, verified solution - following all Development Rules]

### Final changes implemented status
- Identify files changed, git commit id
```
