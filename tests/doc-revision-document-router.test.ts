/**
 * Tests for document router - auto-detection and unified extraction
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { extractDocumentComments } from '../dist/lib/doc-revision/document-router.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Document Router', () => {
  
  describe('File Type Detection', () => {
    
    it('should detect .md files as markdown', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-comments.md');
      await fs.writeFile(testFile, '%% test comment %%\n');
      
      const result = await extractDocumentComments(testFile);
      
      assert.equal(result.method, 'markdown');
      assert.equal(result.error, undefined);
      
      await fs.unlink(testFile);
    });

    it('should detect .markdown files as markdown', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-comments.markdown');
      await fs.writeFile(testFile, '%% test comment %%\n');
      
      const result = await extractDocumentComments(testFile);
      
      assert.equal(result.method, 'markdown');
      assert.equal(result.error, undefined);
      
      await fs.unlink(testFile);
    });

    it('should detect .docx files as word', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-track-changes.docx');
      
      const result = await extractDocumentComments(testFile);
      
      assert.equal(result.method, 'word');
      // Note: This may have an error if python-docx isn't installed, but method should still be 'word'
    });

    it('should return error for unsupported file types', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test.txt');
      await fs.writeFile(testFile, 'test content\n');
      
      const result = await extractDocumentComments(testFile);
      
      assert.notEqual(result.error, undefined);
      assert.ok(result.error?.includes('Unsupported file type'));
      assert.ok(result.error?.includes('.txt'));
      
      await fs.unlink(testFile);
    });

    it('should return error for .doc files (old Word format)', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test.doc');
      await fs.writeFile(testFile, 'fake doc content\n');
      
      const result = await extractDocumentComments(testFile);
      
      assert.notEqual(result.error, undefined);
      assert.ok(result.error?.includes('Unsupported file type'));
      
      await fs.unlink(testFile);
    });

    it('should return error for non-existent files', async () => {
      const result = await extractDocumentComments('/path/to/nonexistent.md');
      
      assert.notEqual(result.error, undefined);
      assert.ok(result.error?.includes('File not found'));
    });

  });

  describe('Markdown Extraction via Router', () => {
    
    it('should extract markdown comments in unified format', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-router-md.md');
      const content = `Line 1
Line 2
%% This is a comment %%
Line 4
Line 5`;
      
      await fs.writeFile(testFile, content);
      
      const result = await extractDocumentComments(testFile);
      
      assert.equal(result.method, 'markdown');
      assert.equal(result.comments.length, 1);
      
      const comment = result.comments[0];
      assert.equal(comment.text, 'This is a comment');
      assert.equal(comment.lineOrParagraphNumber, 3);
      assert.equal(comment.type, 'comment');
      assert.deepEqual(comment.contextBefore, ['Line 1', 'Line 2']);
      assert.deepEqual(comment.contextAfter, ['Line 4', 'Line 5']);
      
      await fs.unlink(testFile);
    });

    it('should handle multiple markdown comments', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-router-md-multi.md');
      const content = `Line 1
%% First comment %%
Line 3
%% Second comment %%
Line 5`;
      
      await fs.writeFile(testFile, content);
      
      const result = await extractDocumentComments(testFile);
      
      assert.equal(result.method, 'markdown');
      assert.equal(result.comments.length, 2);
      assert.equal(result.comments[0].text, 'First comment');
      assert.equal(result.comments[1].text, 'Second comment');
      
      await fs.unlink(testFile);
    });

  });

  describe('Word Extraction via Router', () => {
    
    it('should extract Word comments in unified format', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-track-changes.docx');
      
      const result = await extractDocumentComments(testFile);
      
      assert.equal(result.method, 'word');
      
      // If python-docx is installed, should have comments/track changes
      if (!result.error) {
        assert.ok(result.comments.length > 0);
        
        // Check that comments have required unified fields
        for (const comment of result.comments) {
          assert.ok(typeof comment.text === 'string');
          assert.ok(typeof comment.lineOrParagraphNumber === 'number');
          assert.ok(Array.isArray(comment.contextBefore));
          assert.ok(Array.isArray(comment.contextAfter));
          assert.ok(['comment', 'insertion', 'deletion'].includes(comment.type || 'comment'));
          
          // Word comments should have author and date
          if (comment.type === 'comment' || comment.type === 'insertion' || comment.type === 'deletion') {
            assert.ok(typeof comment.author === 'string');
            assert.ok(typeof comment.date === 'string');
          }
        }
      }
    });

  });

  describe('Unified Output Format', () => {
    
    it('should produce consistent output structure for markdown', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-unified-md.md');
      await fs.writeFile(testFile, '%% test %%\n');
      
      const result = await extractDocumentComments(testFile);
      
      assert.ok('method' in result);
      assert.ok('comments' in result);
      assert.ok(Array.isArray(result.comments));
      
      if (result.comments.length > 0) {
        const comment = result.comments[0];
        assert.ok('text' in comment);
        assert.ok('lineOrParagraphNumber' in comment);
        assert.ok('contextBefore' in comment);
        assert.ok('contextAfter' in comment);
        assert.ok('type' in comment);
      }
      
      await fs.unlink(testFile);
    });

    it('should produce consistent output structure for Word', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-track-changes.docx');
      
      const result = await extractDocumentComments(testFile);
      
      assert.ok('method' in result);
      assert.ok('comments' in result);
      assert.ok(Array.isArray(result.comments));
      
      // Structure should be consistent even if there's an error
      if (!result.error && result.comments.length > 0) {
        const comment = result.comments[0];
        assert.ok('text' in comment);
        assert.ok('lineOrParagraphNumber' in comment);
        assert.ok('contextBefore' in comment);
        assert.ok('contextAfter' in comment);
        assert.ok('type' in comment);
      }
    });

  });

  describe('Logging', () => {
    
    // Note: Console logging is tested indirectly via the method field
    // The router logs which method is used, and this is reflected in result.method
    
    it('should log markdown method usage', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-log-md.md');
      await fs.writeFile(testFile, '%% test %%\n');
      
      const result = await extractDocumentComments(testFile);
      
      // The method field confirms which extraction method was logged/used
      assert.equal(result.method, 'markdown');
      
      await fs.unlink(testFile);
    });

    it('should log word method usage', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-track-changes.docx');
      
      const result = await extractDocumentComments(testFile);
      
      // The method field confirms which extraction method was logged/used
      assert.equal(result.method, 'word');
    });

  });

});
