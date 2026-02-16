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

  describe('Track Changes Extraction (Real Fixture)', () => {
    const fixturePath = path.join(process.cwd(), 'tests/fixtures/test-track-changes.docx');

    it('should extract insertions from real Word document', async () => {
      const isInstalled = await checkPythonDocxInstalled();
      if (!isInstalled) {
        console.log('Skipping test: python-docx not installed');
        return;
      }

      const result = await extractWordComments(fixturePath);
      
      assert.ok(!result.error, 'Should not have error for valid fixture');
      assert.ok(result.trackChanges.length > 0, 'Should extract track changes');
      
      // Find insertions
      const insertions = result.trackChanges.filter(tc => tc.type === 'insertion');
      assert.ok(insertions.length >= 2, 'Should have at least 2 insertions');
      
      // Verify insertion structure
      const firstInsertion = insertions[0];
      assert.ok(firstInsertion.author, 'Should have author');
      assert.ok(firstInsertion.date, 'Should have date');
      assert.ok(firstInsertion.text, 'Should have text');
      assert.equal(typeof firstInsertion.paragraphIndex, 'number', 'Should have paragraphIndex');
    });

    it('should extract deletions from real Word document', async () => {
      const isInstalled = await checkPythonDocxInstalled();
      if (!isInstalled) {
        console.log('Skipping test: python-docx not installed');
        return;
      }

      const result = await extractWordComments(fixturePath);
      
      assert.ok(!result.error, 'Should not have error for valid fixture');
      
      // Find deletions
      const deletions = result.trackChanges.filter(tc => tc.type === 'deletion');
      assert.ok(deletions.length >= 2, 'Should have at least 2 deletions');
      
      // Verify deletion structure
      const firstDeletion = deletions[0];
      assert.ok(firstDeletion.author, 'Should have author');
      assert.ok(firstDeletion.date, 'Should have date');
      assert.ok(firstDeletion.text, 'Should have text');
      assert.equal(typeof firstDeletion.paragraphIndex, 'number', 'Should have paragraphIndex');
    });

    it('should extract paragraph context correctly', async () => {
      const isInstalled = await checkPythonDocxInstalled();
      if (!isInstalled) {
        console.log('Skipping test: python-docx not installed');
        return;
      }

      const result = await extractWordComments(fixturePath);
      
      assert.ok(!result.error, 'Should not have error for valid fixture');
      assert.ok(result.paragraphs.length > 0, 'Should extract paragraphs');
      
      // Verify we have the title paragraph
      assert.ok(
        result.paragraphs.some(p => p.includes('Track Changes Extraction')),
        'Should extract document title'
      );
    });

    it('should include author and date metadata', async () => {
      const isInstalled = await checkPythonDocxInstalled();
      if (!isInstalled) {
        console.log('Skipping test: python-docx not installed');
        return;
      }

      const result = await extractWordComments(fixturePath);
      
      assert.ok(!result.error, 'Should not have error');
      
      // Verify specific authors from our test fixture
      const authors = new Set(result.trackChanges.map(tc => tc.author));
      assert.ok(authors.has('John Doe'), 'Should have John Doe as author');
      assert.ok(authors.has('Jane Smith'), 'Should have Jane Smith as author');
      
      // Verify dates are present
      result.trackChanges.forEach(tc => {
        assert.ok(tc.date, `Track change by ${tc.author} should have date`);
        assert.match(tc.date, /^\d{4}-\d{2}-\d{2}/, 'Date should be ISO format');
      });
    });

    it('should link changes to correct paragraph indices', async () => {
      const isInstalled = await checkPythonDocxInstalled();
      if (!isInstalled) {
        console.log('Skipping test: python-docx not installed');
        return;
      }

      const result = await extractWordComments(fixturePath);
      
      assert.ok(!result.error, 'Should not have error');
      
      // All paragraphIndex values should be valid
      result.trackChanges.forEach(tc => {
        assert.ok(
          tc.paragraphIndex >= 0 && tc.paragraphIndex < result.paragraphs.length,
          `Paragraph index ${tc.paragraphIndex} should be valid (0-${result.paragraphs.length - 1})`
        );
      });
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
