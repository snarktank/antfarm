import type { CategorizedFeedback, Priority } from './analyzer.js';
import fs from 'fs/promises';
import path from 'path';

export interface RevisionPlan {
  feedback: CategorizedFeedback;
  action: string;
}

export interface Change {
  lineOrParagraph: number;
  originalText: string;
  revisedText: string;
  reason: string;
  feedbackText: string;
}

export interface RevisionResult {
  modifiedContent: string;
  changeLog: Change[];
  revisionPlan: RevisionPlan[];
}

/**
 * Applies revisions to a document based on categorized feedback.
 * Processes feedback in priority order (high → medium → low).
 * Preserves formatting for markdown (headings, lists, code, links).
 */
export async function applyRevisions(
  filePath: string,
  categorizedFeedback: CategorizedFeedback[]
): Promise<RevisionResult> {
  // Read original file
  const originalContent = await fs.readFile(filePath, 'utf-8');
  
  // Detect file type
  const ext = path.extname(filePath).toLowerCase();
  const fileType = ext === '.md' || ext === '.markdown' ? 'markdown' : 
                   ext === '.docx' ? 'word' : null;
  
  if (!fileType) {
    throw new Error(`Unsupported file type: ${ext}`);
  }
  
  // Create revision plan (sorted by priority)
  const revisionPlan = createRevisionPlan(categorizedFeedback);
  
  // Apply revisions based on file type
  let modifiedContent: string;
  let changeLog: Change[];
  
  if (fileType === 'markdown') {
    const result = applyMarkdownRevisions(originalContent, revisionPlan);
    modifiedContent = result.content;
    changeLog = result.changes;
  } else {
    // Word support would go here - for now, throw
    throw new Error('Word document revision not yet implemented');
  }
  
  return {
    modifiedContent,
    changeLog,
    revisionPlan
  };
}

/**
 * Creates a revision plan sorted by priority (high → medium → low).
 */
function createRevisionPlan(feedback: CategorizedFeedback[]): RevisionPlan[] {
  const priorityOrder: Record<Priority, number> = {
    high: 0,
    medium: 1,
    low: 2
  };
  
  // Sort feedback by priority
  const sorted = [...feedback].sort((a, b) => 
    priorityOrder[a.priority] - priorityOrder[b.priority]
  );
  
  // Create plan with actions
  return sorted.map(item => ({
    feedback: item,
    action: determineAction(item)
  }));
}

/**
 * Determines the appropriate action based on feedback category.
 */
function determineAction(feedback: CategorizedFeedback): string {
  const { category, originalComment } = feedback;
  
  switch (category) {
    case 'factual_error':
      return `Correct factual error at line ${originalComment.lineOrParagraphNumber}: ${originalComment.text}`;
    case 'missing_info':
      return `Add missing information at line ${originalComment.lineOrParagraphNumber}: ${originalComment.text}`;
    case 'tone':
      return `Adjust tone at line ${originalComment.lineOrParagraphNumber}: ${originalComment.text}`;
    case 'structure':
      return `Restructure content at line ${originalComment.lineOrParagraphNumber}: ${originalComment.text}`;
  }
}

/**
 * Applies revisions to markdown content while preserving formatting.
 */
function applyMarkdownRevisions(
  content: string,
  plan: RevisionPlan[]
): { content: string; changes: Change[] } {
  const lines = content.split('\n');
  const changes: Change[] = [];
  
  // Process each revision in the plan
  for (const item of plan) {
    const { feedback } = item;
    const lineNumber = feedback.originalComment.lineOrParagraphNumber;
    
    // Validate line number
    if (lineNumber < 1 || lineNumber > lines.length) {
      continue; // Skip invalid line numbers
    }
    
    const lineIndex = lineNumber - 1;
    const originalLine = lines[lineIndex];
    
    // Apply revision based on category
    const revisedLine = applyMarkdownRevision(originalLine, feedback);
    
    // Only record change if line actually changed
    if (revisedLine !== originalLine) {
      lines[lineIndex] = revisedLine;
      
      changes.push({
        lineOrParagraph: lineNumber,
        originalText: originalLine,
        revisedText: revisedLine,
        reason: feedback.reasoning,
        feedbackText: feedback.originalComment.text
      });
    }
  }
  
  return {
    content: lines.join('\n'),
    changes
  };
}

/**
 * Applies a single revision to a markdown line while preserving formatting.
 */
function applyMarkdownRevision(line: string, feedback: CategorizedFeedback): string {
  const { category, originalComment } = feedback;
  const commentText = originalComment.text; // Preserve original case
  const commentTextLower = commentText.toLowerCase(); // For pattern matching
  
  // Preserve leading/trailing whitespace and markdown syntax
  const leadingWhitespace = line.match(/^\s*/)?.[0] || '';
  const trailingWhitespace = line.match(/\s*$/)?.[0] || '';
  
  // Extract markdown prefix (e.g., "## ", "- ", "1. ", etc.)
  const markdownPrefix = extractMarkdownPrefix(line);
  const contentStart = leadingWhitespace.length + markdownPrefix.length;
  const contentEnd = line.length - trailingWhitespace.length;
  const content = line.substring(contentStart, contentEnd);
  
  let revisedContent = content;
  
  // Apply category-specific revisions
  switch (category) {
    case 'factual_error':
      revisedContent = handleFactualError(content, commentText, commentTextLower);
      break;
    case 'missing_info':
      revisedContent = handleMissingInfo(content, commentText, commentTextLower);
      break;
    case 'tone':
      revisedContent = handleToneAdjustment(content, commentTextLower);
      break;
    case 'structure':
      // Structure changes typically don't modify line content, just organization
      // For now, preserve content as-is
      break;
  }
  
  // Reconstruct line with preserved formatting
  return leadingWhitespace + markdownPrefix + revisedContent + trailingWhitespace;
}

/**
 * Extracts markdown prefix from a line (headings, list markers, etc.)
 */
function extractMarkdownPrefix(line: string): string {
  const trimmed = line.trimStart();
  
  // Heading (# ## ### etc.)
  const headingMatch = trimmed.match(/^(#{1,6}\s+)/);
  if (headingMatch) return headingMatch[1];
  
  // Unordered list (- or * or +)
  const unorderedMatch = trimmed.match(/^([-*+]\s+)/);
  if (unorderedMatch) return unorderedMatch[1];
  
  // Ordered list (1. 2. etc.)
  const orderedMatch = trimmed.match(/^(\d+\.\s+)/);
  if (orderedMatch) return orderedMatch[1];
  
  // Blockquote (>)
  const quoteMatch = trimmed.match(/^(>\s*)/);
  if (quoteMatch) return quoteMatch[1];
  
  return '';
}

/**
 * Handles factual error corrections.
 * Looks for specific correction instructions in the comment.
 */
function handleFactualError(content: string, commentText: string, commentTextLower: string): string {
  // Look for explicit corrections like "should be X" or "change to X"
  // Use original case for extraction, lowercase for pattern matching
  const shouldBeMatch = commentText.match(/should be\s+['""]?([^'""\n]+)['""]?/i);
  if (shouldBeMatch) {
    return shouldBeMatch[1].trim();
  }
  
  const changeToMatch = commentText.match(/change to\s+['""]?([^'""\n]+)['""]?/i);
  if (changeToMatch) {
    return changeToMatch[1].trim();
  }
  
  const replaceMatch = commentText.match(/replace with\s+['""]?([^'""\n]+)['""]?/i);
  if (replaceMatch) {
    return replaceMatch[1].trim();
  }
  
  // If no explicit instruction, append [NEEDS VERIFICATION]
  return `${content} [NEEDS VERIFICATION]`;
}

/**
 * Handles missing information additions.
 * Looks for specific text to add in the comment.
 */
function handleMissingInfo(content: string, commentText: string, commentTextLower: string): string {
  // Look for explicit additions like "add X" or "include X"
  // Use original case for extraction
  const addMatch = commentText.match(/add\s+['""]?([^'""\n]+)['""]?/i);
  if (addMatch) {
    return `${content} ${addMatch[1].trim()}`;
  }
  
  const includeMatch = commentText.match(/include\s+['""]?([^'""\n]+)['""]?/i);
  if (includeMatch) {
    return `${content} ${includeMatch[1].trim()}`;
  }
  
  // If no explicit instruction, append [TODO: add details]
  return `${content} [TODO: add details]`;
}

/**
 * Handles tone adjustments.
 * Applies basic tone improvements (removing passive voice, simplifying).
 */
function handleToneAdjustment(content: string, commentText: string): string {
  let adjusted = content;
  
  // If comment mentions "too formal", try to make more casual
  if (commentText.includes('too formal') || commentText.includes('stiff')) {
    adjusted = adjusted.replace(/utilize/gi, 'use');
    adjusted = adjusted.replace(/implement/gi, 'build');
    adjusted = adjusted.replace(/facilitate/gi, 'help');
  }
  
  // If comment mentions "too casual", try to make more formal
  if (commentText.includes('too casual') || commentText.includes('unprofessional')) {
    adjusted = adjusted.replace(/\bkinda\b/gi, 'somewhat');
    adjusted = adjusted.replace(/\bgonna\b/gi, 'going to');
    adjusted = adjusted.replace(/\bwanna\b/gi, 'want to');
  }
  
  // If comment mentions "wordy" or "repetitive", look for common redundancies
  if (commentText.includes('wordy') || commentText.includes('repetitive')) {
    // Handle "in order to" -> "to" with capitalization preservation
    adjusted = adjusted.replace(/In order to/g, 'To');
    adjusted = adjusted.replace(/in order to/gi, 'to');
    adjusted = adjusted.replace(/due to the fact that/gi, 'because');
    adjusted = adjusted.replace(/at this point in time/gi, 'now');
  }
  
  // If nothing changed, append [REVIEW TONE]
  if (adjusted === content) {
    return `${content} [REVIEW TONE]`;
  }
  
  return adjusted;
}
