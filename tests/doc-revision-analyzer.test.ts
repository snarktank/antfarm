import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { categorizeFeedback } from '../dist/lib/doc-revision/analyzer.js';
import type { UnifiedComment } from '../dist/lib/doc-revision/document-router.js';

describe('Analyzer - Feedback Categorization', () => {
  
  describe('Category Detection', () => {
    
    it('should categorize factual errors correctly', () => {
      const comments: UnifiedComment[] = [
        {
          text: 'This is incorrect - the version is 8.10, not 8.9',
          lineOrParagraphNumber: 1,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        },
        {
          text: 'Wrong information here - needs verification',
          lineOrParagraphNumber: 2,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        }
      ];
      
      const result = categorizeFeedback(comments);
      
      assert.equal(result[0].category, 'factual_error');
      assert.equal(result[1].category, 'factual_error');
    });
    
    it('should categorize missing info requests correctly', () => {
      const comments: UnifiedComment[] = [
        {
          text: 'Add more detail about the recovery process',
          lineOrParagraphNumber: 1,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        },
        {
          text: 'Missing explanation of how this works',
          lineOrParagraphNumber: 2,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        }
      ];
      
      const result = categorizeFeedback(comments);
      
      assert.equal(result[0].category, 'missing_info');
      assert.equal(result[1].category, 'missing_info');
    });
    
    it('should categorize tone issues correctly', () => {
      const comments: UnifiedComment[] = [
        {
          text: 'The tone here sounds too aggressive',
          lineOrParagraphNumber: 1,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        },
        {
          text: 'This phrasing feels awkward and unclear',
          lineOrParagraphNumber: 2,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        }
      ];
      
      const result = categorizeFeedback(comments);
      
      assert.equal(result[0].category, 'tone');
      assert.equal(result[1].category, 'tone');
    });
    
    it('should categorize structure changes correctly', () => {
      const comments: UnifiedComment[] = [
        {
          text: 'Move this section to after the overview',
          lineOrParagraphNumber: 1,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        },
        {
          text: 'Reorganize this to improve flow',
          lineOrParagraphNumber: 2,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        }
      ];
      
      const result = categorizeFeedback(comments);
      
      assert.equal(result[0].category, 'structure');
      assert.equal(result[1].category, 'structure');
    });
  });
  
  describe('Priority Assignment', () => {
    
    it('should assign high priority to factual errors by default', () => {
      const comments: UnifiedComment[] = [
        {
          text: 'This is incorrect',
          lineOrParagraphNumber: 1,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        }
      ];
      
      const result = categorizeFeedback(comments);
      
      assert.equal(result[0].priority, 'high');
    });
    
    it('should assign medium priority to missing info by default', () => {
      const comments: UnifiedComment[] = [
        {
          text: 'Add more details here',
          lineOrParagraphNumber: 1,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        }
      ];
      
      const result = categorizeFeedback(comments);
      
      assert.equal(result[0].priority, 'medium');
    });
    
    it('should assign low priority to tone issues by default', () => {
      const comments: UnifiedComment[] = [
        {
          text: 'The tone sounds too formal',
          lineOrParagraphNumber: 1,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        }
      ];
      
      const result = categorizeFeedback(comments);
      
      assert.equal(result[0].priority, 'low');
    });
    
    it('should assign medium priority to structure changes by default', () => {
      const comments: UnifiedComment[] = [
        {
          text: 'Reorganize this section',
          lineOrParagraphNumber: 1,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        }
      ];
      
      const result = categorizeFeedback(comments);
      
      assert.equal(result[0].priority, 'medium');
    });
    
    it('should override default priority with explicit high priority indicators', () => {
      const comments: UnifiedComment[] = [
        {
          text: 'CRITICAL: Add this information immediately',
          lineOrParagraphNumber: 1,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        },
        {
          text: 'This tone change is urgent and required',
          lineOrParagraphNumber: 2,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        }
      ];
      
      const result = categorizeFeedback(comments);
      
      // Both should be high priority despite category defaults
      assert.equal(result[0].priority, 'high');
      assert.equal(result[1].priority, 'high');
    });
    
    it('should override default priority with explicit low priority indicators', () => {
      const comments: UnifiedComment[] = [
        {
          text: 'Minor nit: this wording could be better',
          lineOrParagraphNumber: 1,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        },
        {
          text: 'Optional suggestion to add more context',
          lineOrParagraphNumber: 2,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        }
      ];
      
      const result = categorizeFeedback(comments);
      
      // Both should be low priority despite category defaults
      assert.equal(result[0].priority, 'low');
      assert.equal(result[1].priority, 'low');
    });
  });
  
  describe('Output Structure', () => {
    
    it('should return structured output with all required fields', () => {
      const comments: UnifiedComment[] = [
        {
          text: 'This is incorrect',
          lineOrParagraphNumber: 1,
          contextBefore: ['Context before'],
          contextAfter: ['Context after'],
          type: 'comment'
        }
      ];
      
      const result = categorizeFeedback(comments);
      
      assert.equal(result.length, 1);
      assert.ok(result[0].originalComment);
      assert.ok(result[0].category);
      assert.ok(result[0].priority);
      assert.ok(result[0].reasoning);
      
      // Verify originalComment is preserved
      assert.equal(result[0].originalComment.text, 'This is incorrect');
      assert.equal(result[0].originalComment.lineOrParagraphNumber, 1);
    });
    
    it('should include reasoning for categorization', () => {
      const comments: UnifiedComment[] = [
        {
          text: 'Add more detail here',
          lineOrParagraphNumber: 1,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        }
      ];
      
      const result = categorizeFeedback(comments);
      
      // Reasoning should be a non-empty string
      assert.ok(typeof result[0].reasoning === 'string');
      assert.ok(result[0].reasoning.length > 0);
      
      // Should mention the category and priority
      assert.ok(result[0].reasoning.includes('medium'));
    });
  });
  
  describe('Ambiguity Handling', () => {
    
    it('should default to factual_error for truly ambiguous feedback', () => {
      const comments: UnifiedComment[] = [
        {
          text: 'Review this part',
          lineOrParagraphNumber: 1,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        },
        {
          text: 'Check here',
          lineOrParagraphNumber: 2,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        }
      ];
      
      const result = categorizeFeedback(comments);
      
      // Both should default to factual_error (most conservative)
      // "check" is a factual_error keyword, so both match that category
      assert.equal(result[0].category, 'factual_error');
      assert.equal(result[1].category, 'factual_error');
    });
    
    it('should categorize based on keywords even when context is sparse', () => {
      const comments: UnifiedComment[] = [
        {
          text: 'This needs attention',
          lineOrParagraphNumber: 1,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        }
      ];
      
      const result = categorizeFeedback(comments);
      
      // "needs" is a missing_info keyword
      assert.equal(result[0].category, 'missing_info');
    });
  });
  
  describe('Multiple Comments', () => {
    
    it('should handle mixed feedback types', () => {
      const comments: UnifiedComment[] = [
        {
          text: 'This is wrong',
          lineOrParagraphNumber: 1,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        },
        {
          text: 'Add more detail',
          lineOrParagraphNumber: 2,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        },
        {
          text: 'Tone sounds harsh',
          lineOrParagraphNumber: 3,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        },
        {
          text: 'Move this section',
          lineOrParagraphNumber: 4,
          contextBefore: [],
          contextAfter: [],
          type: 'comment'
        }
      ];
      
      const result = categorizeFeedback(comments);
      
      assert.equal(result.length, 4);
      assert.equal(result[0].category, 'factual_error');
      assert.equal(result[1].category, 'missing_info');
      assert.equal(result[2].category, 'tone');
      assert.equal(result[3].category, 'structure');
    });
    
    it('should handle empty comment array', () => {
      const comments: UnifiedComment[] = [];
      
      const result = categorizeFeedback(comments);
      
      assert.equal(result.length, 0);
    });
  });
  
  describe('Real-World Scenarios', () => {
    
    it('should handle track changes (insertions/deletions)', () => {
      const comments: UnifiedComment[] = [
        {
          text: 'Add version 8.10 specification',
          lineOrParagraphNumber: 5,
          contextBefore: ['CyberSense'],
          contextAfter: ['includes'],
          type: 'insertion',
          author: 'Reviewer',
          date: '2024-01-15'
        },
        {
          text: 'outdated claim',
          lineOrParagraphNumber: 10,
          contextBefore: ['This product'],
          contextAfter: ['should be removed'],
          type: 'deletion',
          author: 'Reviewer',
          date: '2024-01-15'
        }
      ];
      
      const result = categorizeFeedback(comments);
      
      assert.equal(result.length, 2);
      
      // Insertions with "add" keyword indicate missing info
      assert.equal(result[0].category, 'missing_info');
      
      // Deletions of "outdated" content suggest factual errors
      assert.equal(result[1].category, 'factual_error');
    });
    
    it('should handle markdown comments with context', () => {
      const comments: UnifiedComment[] = [
        {
          text: 'Verify this claim - I think NetApp ARP requires ONTAP 9.15+',
          lineOrParagraphNumber: 42,
          contextBefore: [
            '## NetApp ARP Overview',
            'NetApp ARP (Autonomous Ransomware Protection) is available in all ONTAP versions.'
          ],
          contextAfter: [
            'It provides automatic detection of ransomware patterns.',
            ''
          ],
          type: 'comment'
        }
      ];
      
      const result = categorizeFeedback(comments);
      
      assert.equal(result.length, 1);
      assert.equal(result[0].category, 'factual_error');
      assert.equal(result[0].priority, 'high');
      
      // Should preserve all context
      assert.equal(result[0].originalComment.contextBefore.length, 2);
      assert.equal(result[0].originalComment.contextAfter.length, 2);
    });
  });
});
