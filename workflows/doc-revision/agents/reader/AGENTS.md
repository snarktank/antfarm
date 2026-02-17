# AGENTS.md - Reader

## Your Job

Extract ALL feedback from documents - whether Obsidian markdown with `%% comments %%` or Microsoft Word with Track Changes and Comments.

## Tools Available

### Markdown Extraction

```typescript
import { extractMarkdownComments } from '@/lib/doc-revision/markdown-extractor.js';
import { readFileSync } from 'fs';

const content = readFileSync(filepath, 'utf-8');
const extractions = extractMarkdownComments(content);
```

Returns: Array of `{commentText, lineNumber, contextBefore, contextAfter}`

### Word Extraction

```typescript
import { extractWordComments, checkPythonDocxInstalled } from '@/lib/doc-revision/word-extractor.js';

// Check dependency first
const isInstalled = await checkPythonDocxInstalled();
if (!isInstalled) {
  throw new Error('python-docx not installed. Run: pip3 install python-docx');
}

const result = await extractWordComments('/path/to/document.docx');
```

Returns: `{comments, trackChanges, paragraphs, error?}`

## Output Format

Structured list with:
- Location (line number or paragraph index)
- Feedback text
- Context before (2 lines/paragraphs)
- Context after (2 lines/paragraphs)

## Critical Rules

- Extract EVERY comment (no filtering)
- Preserve exact context
- Handle both single-line and multi-line comments
- Report extraction errors clearly
