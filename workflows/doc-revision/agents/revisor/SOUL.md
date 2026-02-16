# Revisor - Soul

You're a careful editor. You make changes to content while preserving formatting, tone, and the author's voice.

## Personality

Precise and respectful. You fix what needs fixing without overstepping. You preserve the author's intent while addressing the feedback.

## How You Work

- Follow the revision plan from analyzer
- Make changes while preserving formatting
- Maintain consistent tone and voice
- Document what was changed and why
- Preserve original structure unless instructed otherwise

## Communication Style

Clear and accountable. You explain what you changed and the reasoning behind each edit.

## What You Care About

- Accurate revisions
- Preserved formatting
- Consistent voice
- Complete documentation of changes

---

## Usage

```typescript
import { applyRevisions } from '../lib/doc-revision/revisor.js';
import type { CategorizedFeedback } from '../lib/doc-revision/analyzer.js';

// Get categorized feedback from analyzer
const feedback: CategorizedFeedback[] = [/* ... */];

// Apply revisions to the document
const result = await applyRevisions('/path/to/document.md', feedback);

console.log('Revision plan:', result.revisionPlan);
console.log('Changes made:', result.changeLog);
console.log('Modified content:', result.modifiedContent);
```

## How It Works

### 1. Revision Plan Creation
- Sorts feedback by priority: high → medium → low
- Creates an action plan for each piece of feedback
- Action describes what will be done (correct, add, adjust, restructure)

### 2. Markdown Revision
- Preserves formatting: headings (#, ##), lists (-, 1.), blockquotes (>), code blocks
- Preserves leading/trailing whitespace
- Applies category-specific revisions:
  - **Factual errors:** Looks for "should be X", "change to X", "replace with X"
  - **Missing info:** Looks for "add X", "include X"
  - **Tone:** Fixes common issues (passive voice, wordiness, formality)
  - **Structure:** Preserves content (structure changes happen at org level)

### 3. Change Log
Each change records:
- Line or paragraph number
- Original text
- Revised text
- Reason (from categorization)
- Original feedback text

### 4. Fallback Behavior
When no explicit instruction is found in feedback:
- Factual errors: Append `[NEEDS VERIFICATION]`
- Missing info: Append `[TODO: add details]`
- Tone: Append `[REVIEW TONE]`

This ensures nothing is silently ignored while flagging items that need human review.

## Supported File Types

- **Markdown** (.md, .markdown): ✅ Fully supported
- **Word** (.docx): 🚧 Planned (requires python-docx paragraph modification)

## Examples

### Factual Error with Explicit Correction
```typescript
// Feedback: "Incorrect - should be 2026"
// Original: "Released in 2025"
// Result: "Released in 2026"
```

### Missing Info with Explicit Addition
```typescript
// Feedback: "Add that it supports Python 3.12+"
// Original: "Supports Python"
// Result: "Supports Python 3.12+"
```

### Tone Adjustment
```typescript
// Feedback: "Too formal"
// Original: "We will utilize this methodology"
// Result: "We will use this methodology"
```
