/**
 * Extracts Obsidian-style %% comment %% blocks from markdown files
 * with surrounding context.
 */

export interface CommentExtraction {
  commentText: string;
  lineNumber: number;
  contextBefore: string[];
  contextAfter: string[];
}

const CONTEXT_LINES = 2;

/**
 * Extracts all %% comment %% blocks from markdown content
 * @param content The markdown file content
 * @returns Array of extracted comments with context
 */
export function extractMarkdownComments(content: string): CommentExtraction[] {
  const lines = content.split('\n');
  const extractions: CommentExtraction[] = [];
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    
    // Look for %% comment start
    const startMatch = line.match(/%%/);
    if (!startMatch) {
      i++;
      continue;
    }
    
    // Check if this is a single-line comment
    const singleLineMatch = line.match(/%%\s*(.+?)\s*%%/);
    if (singleLineMatch) {
      const commentText = singleLineMatch[1].trim();
      
      // Skip empty comments
      if (commentText.length === 0) {
        i++;
        continue;
      }
      
      const contextBefore = extractContextBefore(lines, i);
      const contextAfter = extractContextAfter(lines, i);
      
      extractions.push({
        commentText,
        lineNumber: i + 1, // 1-indexed line numbers
        contextBefore,
        contextAfter
      });
      
      i++;
      continue;
    }
    
    // Multi-line comment - find the closing %%
    let commentLines: string[] = [];
    let startLine = i;
    let foundClosing = false;
    
    // Extract text after opening %% on the same line
    const afterOpening = line.substring(line.indexOf('%%') + 2).trim();
    if (afterOpening) {
      commentLines.push(afterOpening);
    }
    
    i++;
    
    // Look for closing %%
    while (i < lines.length) {
      const currentLine = lines[i];
      const closingIndex = currentLine.indexOf('%%');
      
      if (closingIndex !== -1) {
        // Found closing - extract text before it
        const beforeClosing = currentLine.substring(0, closingIndex).trim();
        if (beforeClosing) {
          commentLines.push(beforeClosing);
        }
        foundClosing = true;
        break;
      } else {
        commentLines.push(currentLine.trim());
      }
      
      i++;
    }
    
    // Only add if we found a proper closing and comment is not empty
    if (foundClosing) {
      const commentText = commentLines.join(' ').trim();
      
      if (commentText.length > 0) {
        const contextBefore = extractContextBefore(lines, startLine);
        const contextAfter = extractContextAfter(lines, i);
        
        extractions.push({
          commentText,
          lineNumber: startLine + 1, // 1-indexed
          contextBefore,
          contextAfter
        });
      }
    }
    
    i++;
  }
  
  return extractions;
}

/**
 * Extract context lines before a comment
 */
function extractContextBefore(lines: string[], lineIndex: number): string[] {
  const start = Math.max(0, lineIndex - CONTEXT_LINES);
  const context: string[] = [];
  
  for (let i = start; i < lineIndex; i++) {
    context.push(lines[i]);
  }
  
  return context;
}

/**
 * Extract context lines after a comment
 */
function extractContextAfter(lines: string[], lineIndex: number): string[] {
  const end = Math.min(lines.length, lineIndex + CONTEXT_LINES + 1);
  const context: string[] = [];
  
  for (let i = lineIndex + 1; i < end; i++) {
    context.push(lines[i]);
  }
  
  return context;
}
