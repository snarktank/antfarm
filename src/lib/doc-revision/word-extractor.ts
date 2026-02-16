/**
 * Word document comment and track changes extractor
 * Uses python-docx via Python subprocess
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execFileAsync = promisify(execFile);

export interface WordComment {
  id: string;
  author: string;
  date: string;
  text: string;
  paragraphIndex: number;
  contextBefore: string[];
  contextAfter: string[];
}

export interface WordTrackChange {
  type: 'insertion' | 'deletion';
  author: string;
  date: string;
  text: string;
  paragraphIndex: number;
}

export interface WordExtractionResult {
  comments: WordComment[];
  trackChanges: WordTrackChange[];
  paragraphs: string[];
  error?: string;
}

/**
 * Extract comments and track changes from a Word .docx file
 * 
 * @param docxPath - Path to the .docx file
 * @returns Structured extraction result with comments, track changes, and paragraphs
 */
export async function extractWordComments(docxPath: string): Promise<WordExtractionResult> {
  // Verify file exists and is .docx
  const ext = path.extname(docxPath).toLowerCase();
  if (ext !== '.docx') {
    return {
      comments: [],
      trackChanges: [],
      paragraphs: [],
      error: `Invalid file extension: ${ext}. Expected .docx`
    };
  }

  try {
    await fs.access(docxPath);
  } catch {
    return {
      comments: [],
      trackChanges: [],
      paragraphs: [],
      error: `File not found: ${docxPath}`
    };
  }

  // Get the path to the Python extraction script
  // Python scripts live in src/, not dist/
  const scriptPath = path.join(__dirname, '../../..', 'src/lib/doc-revision/extract-word-comments.py');

  try {
    // Call Python script
    const { stdout, stderr } = await execFileAsync('python3', [scriptPath, docxPath], {
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large documents
    });

    if (stderr) {
      console.warn('Python script stderr:', stderr);
    }

    const result = JSON.parse(stdout) as WordExtractionResult;

    if (result.error) {
      return {
        comments: [],
        trackChanges: [],
        paragraphs: [],
        error: result.error
      };
    }

    // Add context to comments based on paragraph index
    const paragraphs = result.paragraphs || [];
    for (const comment of result.comments) {
      const idx = comment.paragraphIndex;
      
      // Get 2 paragraphs before
      comment.contextBefore = [];
      for (let i = Math.max(0, idx - 2); i < idx; i++) {
        if (paragraphs[i]) {
          comment.contextBefore.push(paragraphs[i]);
        }
      }

      // Get 2 paragraphs after
      comment.contextAfter = [];
      for (let i = idx + 1; i < Math.min(paragraphs.length, idx + 3); i++) {
        if (paragraphs[i]) {
          comment.contextAfter.push(paragraphs[i]);
        }
      }
    }

    return result;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      comments: [],
      trackChanges: [],
      paragraphs: [],
      error: `Failed to extract Word comments: ${errorMsg}`
    };
  }
}

/**
 * Check if python-docx is installed
 */
export async function checkPythonDocxInstalled(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('python3', ['-c', 'import docx; print("OK")']);
    return stdout.trim() === 'OK';
  } catch {
    return false;
  }
}
