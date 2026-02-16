import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyRevisions } from '../dist/lib/doc-revision/revisor.js';
import type { CategorizedFeedback } from '../dist/lib/doc-revision/analyzer.js';
import type { UnifiedComment } from '../dist/lib/doc-revision/document-router.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Revisor Agent', () => {
  
  describe('Revision Plan Creation', () => {
    it('should sort feedback by priority (high → medium → low)', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, 'Line 1\nLine 2\nLine 3', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'Low priority', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'tone',
          priority: 'low',
          reasoning: 'Low priority feedback'
        },
        {
          originalComment: { text: 'High priority', lineOrParagraphNumber: 2, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'factual_error',
          priority: 'high',
          reasoning: 'High priority feedback'
        },
        {
          originalComment: { text: 'Medium priority', lineOrParagraphNumber: 3, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'missing_info',
          priority: 'medium',
          reasoning: 'Medium priority feedback'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      assert.strictEqual(result.revisionPlan[0].feedback.priority, 'high');
      assert.strictEqual(result.revisionPlan[1].feedback.priority, 'medium');
      assert.strictEqual(result.revisionPlan[2].feedback.priority, 'low');
      
      await fs.unlink(testFile);
    });
    
    it('should create action descriptions for each feedback item', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, 'Test content', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'Fix this error', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'factual_error',
          priority: 'high',
          reasoning: 'Factual error'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      assert.ok(result.revisionPlan[0].action.includes('Correct factual error'));
      assert.ok(result.revisionPlan[0].action.includes('line 1'));
      
      await fs.unlink(testFile);
    });
  });
  
  describe('Markdown Formatting Preservation', () => {
    it('should preserve heading markers', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, '## Original Heading', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'should be "New Heading"', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'factual_error',
          priority: 'high',
          reasoning: 'Incorrect heading'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      assert.ok(result.modifiedContent.startsWith('## '));
      assert.ok(result.modifiedContent.includes('New Heading'));
      
      await fs.unlink(testFile);
    });
    
    it('should preserve list markers (unordered)', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, '- Original item', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'should be "Revised item"', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'factual_error',
          priority: 'high',
          reasoning: 'Incorrect content'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      assert.ok(result.modifiedContent.startsWith('- '));
      assert.ok(result.modifiedContent.includes('Revised item'));
      
      await fs.unlink(testFile);
    });
    
    it('should preserve list markers (ordered)', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, '1. First item', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'should be "Updated item"', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'factual_error',
          priority: 'high',
          reasoning: 'Needs update'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      assert.ok(result.modifiedContent.startsWith('1. '));
      assert.ok(result.modifiedContent.includes('Updated item'));
      
      await fs.unlink(testFile);
    });
    
    it('should preserve blockquote markers', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, '> Original quote', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'should be "Corrected quote"', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'factual_error',
          priority: 'high',
          reasoning: 'Quote error'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      assert.ok(result.modifiedContent.startsWith('> '));
      assert.ok(result.modifiedContent.includes('Corrected quote'));
      
      await fs.unlink(testFile);
    });
    
    it('should preserve leading whitespace', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, '  Indented content', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'should be "Updated content"', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'factual_error',
          priority: 'high',
          reasoning: 'Content update'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      assert.ok(result.modifiedContent.startsWith('  '));
      
      await fs.unlink(testFile);
    });
  });
  
  describe('Factual Error Handling', () => {
    it('should apply explicit "should be" corrections', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, 'Released in 2025', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'Incorrect - should be "Released in 2026"', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'factual_error',
          priority: 'high',
          reasoning: 'Year is wrong'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      assert.strictEqual(result.modifiedContent, 'Released in 2026');
      assert.strictEqual(result.changeLog.length, 1);
      assert.strictEqual(result.changeLog[0].originalText, 'Released in 2025');
      assert.strictEqual(result.changeLog[0].revisedText, 'Released in 2026');
      
      await fs.unlink(testFile);
    });
    
    it('should apply "change to" corrections', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, 'Supports Python 2.7', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'change to "Supports Python 3.12+"', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'factual_error',
          priority: 'high',
          reasoning: 'Outdated version'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      assert.strictEqual(result.modifiedContent, 'Supports Python 3.12+');
      
      await fs.unlink(testFile);
    });
    
    it('should apply "replace with" corrections', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, 'Old text', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'replace with "New text"', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'factual_error',
          priority: 'high',
          reasoning: 'Needs replacement'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      assert.strictEqual(result.modifiedContent, 'New text');
      
      await fs.unlink(testFile);
    });
    
    it('should append [NEEDS VERIFICATION] when no explicit correction', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, 'Check this fact', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'This seems incorrect', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'factual_error',
          priority: 'high',
          reasoning: 'Needs verification'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      assert.ok(result.modifiedContent.includes('[NEEDS VERIFICATION]'));
      
      await fs.unlink(testFile);
    });
  });
  
  describe('Missing Info Handling', () => {
    it('should add explicit "add" instructions', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, 'Supports Python', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'add "3.12 and above"', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'missing_info',
          priority: 'medium',
          reasoning: 'Missing version info'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      assert.ok(result.modifiedContent.includes('3.12 and above'));
      
      await fs.unlink(testFile);
    });
    
    it('should add explicit "include" instructions', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, 'Available now', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'include "as of February 2026"', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'missing_info',
          priority: 'medium',
          reasoning: 'Missing date'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      assert.ok(result.modifiedContent.includes('as of February 2026'));
      
      await fs.unlink(testFile);
    });
    
    it('should append [TODO: add details] when no explicit instruction', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, 'More details needed here', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'Needs more information', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'missing_info',
          priority: 'medium',
          reasoning: 'Incomplete'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      assert.ok(result.modifiedContent.includes('[TODO: add details]'));
      
      await fs.unlink(testFile);
    });
  });
  
  describe('Tone Adjustment Handling', () => {
    it('should make text less formal when requested', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, 'We will utilize this methodology', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'too formal - make more casual', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'tone',
          priority: 'low',
          reasoning: 'Overly formal'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      assert.ok(result.modifiedContent.includes('use'));
      assert.ok(!result.modifiedContent.includes('utilize'));
      
      await fs.unlink(testFile);
    });
    
    it('should make text more formal when requested', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, "We're gonna build this", 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'too casual - needs to be professional', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'tone',
          priority: 'low',
          reasoning: 'Too informal'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      assert.ok(result.modifiedContent.includes('going to'));
      assert.ok(!result.modifiedContent.includes('gonna'));
      
      await fs.unlink(testFile);
    });
    
    it('should simplify wordy text when requested', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, 'In order to build this feature', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'wordy - simplify', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'tone',
          priority: 'low',
          reasoning: 'Too verbose'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      assert.ok(result.modifiedContent.includes('To build'));
      assert.ok(!result.modifiedContent.includes('In order to'));
      
      await fs.unlink(testFile);
    });
    
    it('should append [REVIEW TONE] when no automatic adjustment applies', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, 'This is fine', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'tone feels off', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'tone',
          priority: 'low',
          reasoning: 'Tone issue'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      assert.ok(result.modifiedContent.includes('[REVIEW TONE]'));
      
      await fs.unlink(testFile);
    });
  });
  
  describe('Change Log', () => {
    it('should record all changes with line numbers and reasons', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, 'Line 1\nLine 2\nLine 3', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'should be "Updated Line 1"', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'factual_error',
          priority: 'high',
          reasoning: 'Error in line 1'
        },
        {
          originalComment: { text: 'add "with details"', lineOrParagraphNumber: 3, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'missing_info',
          priority: 'medium',
          reasoning: 'Missing info in line 3'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      assert.strictEqual(result.changeLog.length, 2);
      assert.strictEqual(result.changeLog[0].lineOrParagraph, 1);
      assert.strictEqual(result.changeLog[0].originalText, 'Line 1');
      assert.strictEqual(result.changeLog[0].revisedText, 'Updated Line 1');
      assert.strictEqual(result.changeLog[0].reason, 'Error in line 1');
      
      assert.strictEqual(result.changeLog[1].lineOrParagraph, 3);
      assert.ok(result.changeLog[1].revisedText.includes('with details'));
      
      await fs.unlink(testFile);
    });
    
    it('should not record changes for lines that were not modified', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, 'Line 1\nLine 2', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'structure change - no content edit', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'structure',
          priority: 'medium',
          reasoning: 'Organization'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      // Structure changes don't modify content, so no change log entry
      assert.strictEqual(result.changeLog.length, 0);
      
      await fs.unlink(testFile);
    });
  });
  
  describe('Error Handling', () => {
    it('should reject unsupported file types', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test.txt');
      await fs.writeFile(testFile, 'Test content', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [];
      
      await assert.rejects(
        async () => applyRevisions(testFile, feedback),
        /Unsupported file type/
      );
      
      await fs.unlink(testFile);
    });
    
    it('should skip invalid line numbers', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      await fs.writeFile(testFile, 'Line 1', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'Fix this', lineOrParagraphNumber: 99, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'factual_error',
          priority: 'high',
          reasoning: 'Invalid line'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      // Should not throw, just skip the invalid line
      assert.strictEqual(result.changeLog.length, 0);
      assert.strictEqual(result.modifiedContent, 'Line 1');
      
      await fs.unlink(testFile);
    });
  });
  
  describe('Real-world Scenario', () => {
    it('should handle multiple feedback items on same document', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.md');
      const content = `# Documentation

## Overview
Released in 2025 and supports Python.

## Features
- Fast
- Reliable
- We will utilize this tool`;
      
      await fs.writeFile(testFile, content, 'utf-8');
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { text: 'should be "Released in 2026"', lineOrParagraphNumber: 4, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'factual_error',
          priority: 'high',
          reasoning: 'Incorrect year'
        },
        {
          originalComment: { text: 'add "3.12 and above"', lineOrParagraphNumber: 4, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'missing_info',
          priority: 'medium',
          reasoning: 'Missing version'
        },
        {
          originalComment: { text: 'too formal', lineOrParagraphNumber: 9, contextBefore: [], contextAfter: [], type: 'comment' },
          category: 'tone',
          priority: 'low',
          reasoning: 'Overly formal'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      // Check that high-priority change was made
      assert.ok(result.modifiedContent.includes('2026'));
      
      // Check that changes were recorded
      assert.ok(result.changeLog.length >= 2);
      
      // Check revision plan was created in priority order
      assert.strictEqual(result.revisionPlan[0].feedback.priority, 'high');
      assert.strictEqual(result.revisionPlan[1].feedback.priority, 'medium');
      assert.strictEqual(result.revisionPlan[2].feedback.priority, 'low');
      
      await fs.unlink(testFile);
    });
  });
  
  describe('Word Document Revision', () => {
    it('should apply revisions to Word documents while preserving styles', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.docx');
      
      // Verify test fixture exists
      const exists = await fs.access(testFile).then(() => true).catch(() => false);
      if (!exists) {
        console.log('Skipping Word revision test - fixture not found');
        return;
      }
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { 
            text: 'should be "correct"', 
            lineOrParagraphNumber: 1, 
            contextBefore: ['This is a incorrect fact that needs correction.'],
            contextAfter: [], 
            type: 'comment' 
          },
          category: 'factual_error',
          priority: 'high',
          reasoning: 'Incorrect word'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      // Should return path to modified document
      assert.ok(result.modifiedContent.includes('-revised.docx'));
      
      // Should record changes
      assert.strictEqual(result.changeLog.length, 1);
      assert.strictEqual(result.changeLog[0].lineOrParagraph, 1);
      assert.ok(result.changeLog[0].revisedText.includes('correct'));
      
      // Clean up
      await fs.unlink(result.modifiedContent).catch(() => {});
    });
    
    it('should handle multiple revisions in priority order for Word', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test-revision.docx');
      
      const exists = await fs.access(testFile).then(() => true).catch(() => false);
      if (!exists) {
        console.log('Skipping Word revision test - fixture not found');
        return;
      }
      
      const feedback: CategorizedFeedback[] = [
        {
          originalComment: { 
            text: 'should be "correct"', 
            lineOrParagraphNumber: 1, 
            contextBefore: ['This is a incorrect fact that needs correction.'],
            contextAfter: [], 
            type: 'comment' 
          },
          category: 'factual_error',
          priority: 'high',
          reasoning: 'Incorrect word'
        },
        {
          originalComment: { 
            text: 'add "about X topic"', 
            lineOrParagraphNumber: 2, 
            contextBefore: ['This sentence is missing some important information.'],
            contextAfter: [], 
            type: 'comment' 
          },
          category: 'missing_info',
          priority: 'medium',
          reasoning: 'Missing details'
        },
        {
          originalComment: { 
            text: 'too wordy', 
            lineOrParagraphNumber: 3, 
            contextBefore: ["I'm gonna utilize this wordy sentence in order to demonstrate tone issues."],
            contextAfter: [], 
            type: 'comment' 
          },
          category: 'tone',
          priority: 'low',
          reasoning: 'Needs simplification'
        }
      ];
      
      const result = await applyRevisions(testFile, feedback);
      
      // Should process all feedback
      assert.strictEqual(result.revisionPlan.length, 3);
      
      // Should be sorted by priority
      assert.strictEqual(result.revisionPlan[0].feedback.priority, 'high');
      assert.strictEqual(result.revisionPlan[1].feedback.priority, 'medium');
      assert.strictEqual(result.revisionPlan[2].feedback.priority, 'low');
      
      // Should record changes (at least the high priority one)
      assert.ok(result.changeLog.length >= 1);
      
      // Clean up
      await fs.unlink(result.modifiedContent).catch(() => {});
    });
    
    it('should throw error for unsupported file types', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'test.txt');
      await fs.writeFile(testFile, 'Test content', 'utf-8');
      
      const feedback: CategorizedFeedback[] = [{
        originalComment: { text: 'test', lineOrParagraphNumber: 1, contextBefore: [], contextAfter: [], type: 'comment' },
        category: 'tone',
        priority: 'low',
        reasoning: 'test'
      }];
      
      await assert.rejects(
        async () => await applyRevisions(testFile, feedback),
        /Unsupported file type/
      );
      
      await fs.unlink(testFile);
    });
  });
});
