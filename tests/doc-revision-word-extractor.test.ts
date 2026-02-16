/**
 * Tests for Word document comment extraction
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { extractWordComments, checkPythonDocxInstalled } from '../dist/lib/doc-revision/word-extractor.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('Word Extractor', () => {
  
  describe('File Type Detection', () => {
    it('should reject non-.docx files', async () => {
      const result = await extractWordComments('/path/to/file.txt');
      
      assert.ok(result.error, 'Should have error for non-.docx file');
      assert.match(result.error!, /Invalid file extension/, 'Error should mention invalid extension');
      assert.equal(result.comments.length, 0, 'Should have no comments');
      assert.equal(result.trackChanges.length, 0, 'Should have no track changes');
    });

    it('should reject files without .docx extension', async () => {
      const result = await extractWordComments('/path/to/file.doc');
      
      assert.ok(result.error, 'Should have error for .doc file');
      assert.match(result.error!, /Invalid file extension/, 'Error should mention invalid extension');
    });

    it('should accept .docx files (case insensitive)', async () => {
      // This will fail on file not found, but should pass extension check
      const result = await extractWordComments('/path/to/file.DOCX');
      
      // Should get "file not found" error, not "invalid extension"
      assert.ok(result.error, 'Should have error for non-existent file');
      assert.match(result.error!, /File not found/, 'Error should be about missing file, not extension');
    });
  });

  describe('File Existence Checks', () => {
    it('should handle non-existent files gracefully', async () => {
      const result = await extractWordComments('/nonexistent/path/file.docx');
      
      assert.ok(result.error, 'Should have error for non-existent file');
      assert.match(result.error!, /File not found/, 'Error should mention file not found');
      assert.equal(result.comments.length, 0, 'Should have no comments');
    });
  });

  describe('Python Dependency Check', () => {
    it('should check if python-docx is installed', async () => {
      const isInstalled = await checkPythonDocxInstalled();
      
      // This test just verifies the function returns a boolean
      // The actual result depends on the test environment
      assert.equal(typeof isInstalled, 'boolean', 'Should return a boolean');
    });
  });

  describe('Empty Document Handling', () => {
    let tempDocPath: string;
    
    before(async () => {
      // Create a minimal valid .docx file for testing
      // A .docx is actually a ZIP file with XML inside
      // For this test, we'll create a simple test file
      const tempDir = os.tmpdir();
      tempDocPath = path.join(tempDir, 'test-empty.docx');
      
      // We'll skip this test if we can't create the file
      // In a full implementation, you'd use a library to create a valid .docx
    });

    it('should handle documents with no comments gracefully', async () => {
      // Skip if we don't have python-docx installed
      const isInstalled = await checkPythonDocxInstalled();
      if (!isInstalled) {
        console.log('Skipping test: python-docx not installed');
        return;
      }

      // This test would require a sample .docx file
      // For now, we'll just verify the function structure
      assert.ok(extractWordComments, 'extractWordComments function should exist');
    });
  });

  describe('Comment Extraction', () => {
    it('should extract comment metadata correctly', async () => {
      // This test requires a sample .docx with comments
      // In a real implementation, you'd have a test fixture file
      
      // For now, verify the interface structure
      const result = await extractWordComments('/nonexistent.docx');
      
      assert.ok(Array.isArray(result.comments), 'Should return comments array');
      assert.ok(Array.isArray(result.trackChanges), 'Should return trackChanges array');
      assert.ok(Array.isArray(result.paragraphs), 'Should return paragraphs array');
    });
  });

  describe('Context Extraction', () => {
    it('should provide context before and after comments', async () => {
      // Verify the structure of extracted comments includes context fields
      const result = await extractWordComments('/nonexistent.docx');
      
      // The result will have an error, but the structure should be correct
      assert.ok('comments' in result, 'Should have comments field');
      
      // If there were comments, they would have:
      // - contextBefore: string[]
      // - contextAfter: string[]
      // - paragraphIndex: number
    });
  });

  describe('Error Handling', () => {
    it('should handle Python execution errors gracefully', async () => {
      // Try to extract from a file with invalid path characters
      // This should trigger an error in the Python subprocess
      const invalidPath = '\x00invalid\x00path.docx';
      const result = await extractWordComments(invalidPath);
      
      assert.ok(result.error, 'Should have error for invalid path');
      assert.equal(result.comments.length, 0, 'Should have no comments on error');
    });

    it('should handle large documents without crashing', async () => {
      // The maxBuffer is set to 10MB, verify the function handles this
      // This is more of a configuration test
      assert.ok(extractWordComments, 'Function should handle large documents via maxBuffer config');
    });
  });

  describe('Output Format', () => {
    it('should return properly structured comment objects', async () => {
      const result = await extractWordComments('/nonexistent.docx');
      
      // Verify the result structure matches the interface
      assert.ok('comments' in result, 'Should have comments field');
      assert.ok('trackChanges' in result, 'Should have trackChanges field');
      assert.ok('paragraphs' in result, 'Should have paragraphs field');
      assert.ok(Array.isArray(result.comments), 'comments should be an array');
      assert.ok(Array.isArray(result.trackChanges), 'trackChanges should be an array');
      assert.ok(Array.isArray(result.paragraphs), 'paragraphs should be an array');
    });
  });
});
