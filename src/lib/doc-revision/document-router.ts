/**
 * Document router - Auto-detects file type and routes to appropriate extractor
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { extractMarkdownComments, type CommentExtraction } from './markdown-extractor.js';
import { extractWordComments, type WordExtractionResult } from './word-extractor.js';

export type ExtractionMethod = 'markdown' | 'word';

export interface UnifiedComment {
  text: string;
  lineOrParagraphNumber: number;
  contextBefore: string[];
  contextAfter: string[];
  author?: string;
  date?: string;
  type?: 'comment' | 'insertion' | 'deletion';
}

export interface DocumentExtractionResult {
  method: ExtractionMethod;
  comments: UnifiedComment[];
  error?: string;
}

/**
 * Auto-detect file type and extract comments/changes
 * 
 * @param filePath - Path to the document file
 * @returns Unified extraction result with method used and comments
 */
export async function extractDocumentComments(filePath: string): Promise<DocumentExtractionResult> {
  // Check if file exists
  try {
    await fs.access(filePath);
  } catch {
    return {
      method: 'markdown', // default for error
      comments: [],
      error: `File not found: ${filePath}`
    };
  }

  // Detect file type by extension
  const ext = path.extname(filePath).toLowerCase();
  const method = detectFileType(ext);

  if (!method) {
    return {
      method: 'markdown', // default for error
      comments: [],
      error: `Unsupported file type: ${ext}. Supported: .md, .markdown, .docx`
    };
  }

  console.log(`[document-router] Using ${method} extraction for ${path.basename(filePath)}`);

  // Route to appropriate extractor
  if (method === 'markdown') {
    return await extractMarkdown(filePath);
  } else {
    return await extractWord(filePath);
  }
}

/**
 * Detect file type from extension
 * 
 * @param ext - File extension (with or without dot)
 * @returns Extraction method or null if unsupported
 */
function detectFileType(ext: string): ExtractionMethod | null {
  const normalized = ext.toLowerCase().replace(/^\./, '');
  
  switch (normalized) {
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'docx':
      return 'word';
    default:
      return null;
  }
}

/**
 * Extract comments from markdown file
 */
async function extractMarkdown(filePath: string): Promise<DocumentExtractionResult> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const extractions = extractMarkdownComments(content);

    const comments: UnifiedComment[] = extractions.map((extraction: CommentExtraction) => ({
      text: extraction.commentText,
      lineOrParagraphNumber: extraction.lineNumber,
      contextBefore: extraction.contextBefore,
      contextAfter: extraction.contextAfter,
      type: 'comment' as const
    }));

    return {
      method: 'markdown',
      comments
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      method: 'markdown',
      comments: [],
      error: `Failed to extract markdown comments: ${errorMsg}`
    };
  }
}

/**
 * Extract comments and track changes from Word file
 */
async function extractWord(filePath: string): Promise<DocumentExtractionResult> {
  try {
    const result = await extractWordComments(filePath);

    if (result.error) {
      return {
        method: 'word',
        comments: [],
        error: result.error
      };
    }

    const comments: UnifiedComment[] = [];

    // Add Word comments
    for (const comment of result.comments) {
      comments.push({
        text: comment.text,
        lineOrParagraphNumber: comment.paragraphIndex,
        contextBefore: comment.contextBefore,
        contextAfter: comment.contextAfter,
        author: comment.author,
        date: comment.date,
        type: 'comment'
      });
    }

    // Add track changes (insertions and deletions)
    for (const change of result.trackChanges) {
      comments.push({
        text: change.text,
        lineOrParagraphNumber: change.paragraphIndex,
        contextBefore: [], // Track changes don't have context in current implementation
        contextAfter: [],
        author: change.author,
        date: change.date,
        type: change.type
      });
    }

    return {
      method: 'word',
      comments
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      method: 'word',
      comments: [],
      error: `Failed to extract Word comments: ${errorMsg}`
    };
  }
}
