/**
 * Tests for SCP-015: Create workflow README.md documentation
 * Validates README content, structure, and completeness
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const WORKFLOW_DIR = resolve(import.meta.dirname, '../workflows/script-class-processor');
const README_PATH = resolve(WORKFLOW_DIR, 'README.md');

describe('SCP-015: README.md Documentation', () => {
  let readmeContent: string;

  it('README.md should exist in workflow directory', () => {
    assert.strictEqual(existsSync(README_PATH), true, 'README.md should exist');
  });

  // Read content for subsequent tests
  it('should read README.md content', () => {
    readmeContent = readFileSync(README_PATH, 'utf-8');
    assert.ok(readmeContent.length > 0, 'README should have content');
  });

  describe('Documentation Structure', () => {
    it('should have a title header', () => {
      assert.ok(readmeContent.includes('# Script Class Processor Workflow'), 
        'Should have main title');
    });

    it('should have Overview section', () => {
      assert.ok(readmeContent.includes('## Overview'), 'Should have Overview section');
    });

    it('should have Prerequisites section', () => {
      assert.ok(readmeContent.includes('## Prerequisites'), 'Should have Prerequisites section');
    });

    it('should have Installation section', () => {
      assert.ok(readmeContent.includes('## Installation'), 'Should have Installation section');
    });

    it('should have Usage section', () => {
      assert.ok(readmeContent.includes('## Usage'), 'Should have Usage section');
    });

    it('should have Input/Output Locations section', () => {
      assert.ok(readmeContent.includes('## Input/Output Locations'), 
        'Should have Input/Output Locations section');
    });

    it('should have Workflow Steps section', () => {
      assert.ok(readmeContent.includes('## Workflow Steps'), 'Should have Workflow Steps section');
    });

    it('should have Configuration section', () => {
      assert.ok(readmeContent.includes('## Configuration'), 'Should have Configuration section');
    });

    it('should have Troubleshooting section', () => {
      assert.ok(readmeContent.includes('## Troubleshooting'), 'Should have Troubleshooting section');
    });
  });

  describe('Workflow Purpose Documentation', () => {
    it('should document processing 2-3 hour transcripts', () => {
      assert.ok(readmeContent.includes('2-3 hours') || readmeContent.includes('2-3 hour'),
        'Should mention transcript duration (2-3 hours)');
    });

    it('should mention 2000-3000 lines', () => {
      assert.ok(readmeContent.includes('2000-3000 lines'),
        'Should mention line count (2000-3000 lines)');
    });

    it('should describe structured learning materials output', () => {
      const hasLearningMaterials = 
        readmeContent.includes('learning materials') ||
        readmeContent.includes('learning notes') ||
        readmeContent.includes('structured notes');
      assert.ok(hasLearningMaterials, 'Should describe learning materials output');
    });

    it('should list all output types', () => {
      assert.ok(readmeContent.includes('jump guide') || readmeContent.includes('Jump Guide'),
        'Should mention Jump Guide output');
      assert.ok(readmeContent.includes('notes') || readmeContent.includes('Notes'),
        'Should mention Notes output');
      assert.ok(readmeContent.includes('quiz') || readmeContent.includes('Quiz'),
        'Should mention Quiz output');
    });
  });

  describe('Usage Instructions', () => {
    it('should document the run command', () => {
      assert.ok(readmeContent.includes('antfarm workflow run script-class-processor'),
        'Should include workflow run command');
    });

    it('should show session identifier usage', () => {
      assert.ok(readmeContent.includes('<session-identifier>') || 
        readmeContent.includes('<session-id>'),
        'Should document session identifier parameter');
    });

    it('should have a usage example', () => {
      assert.ok(readmeContent.includes('### Example') || readmeContent.includes('## Example'),
        'Should have example section');
    });
  });

  describe('Input/Output File Locations', () => {
    it('should document input directory location', () => {
      assert.ok(readmeContent.includes('transcripts/raw/'),
        'Should document input directory (transcripts/raw/)');
    });

    it('should mention .vtt file format', () => {
      assert.ok(readmeContent.includes('.vtt'),
        'Should mention VTT file format');
    });

    it('should document cleaned output location', () => {
      assert.ok(readmeContent.includes('transcripts/cleaned/'),
        'Should document cleaned output location');
    });

    it('should document metadata output location', () => {
      assert.ok(readmeContent.includes('metadata'),
        'Should document metadata output');
    });

    it('should document analysis output location', () => {
      assert.ok(readmeContent.includes('analysis/'),
        'Should document analysis output location');
    });

    it('should document final output location', () => {
      assert.ok(readmeContent.includes('output/'),
        'Should document final output location');
    });

    it('should document reports location', () => {
      assert.ok(readmeContent.includes('reports/'),
        'Should document reports location');
    });
  });

  describe('All 7 Steps Documented', () => {
    it('should document Step 1: Detect', () => {
      assert.ok(readmeContent.includes('Step 1') && 
        (readmeContent.includes('Detect') || readmeContent.includes('file-watcher')),
        'Should document Step 1: Detect');
    });

    it('should document Step 2: Preprocess', () => {
      assert.ok(readmeContent.includes('Step 2') && 
        (readmeContent.includes('Preprocess') || readmeContent.includes('transcript-cleaner')),
        'Should document Step 2: Preprocess');
    });

    it('should document Step 3: Chunk', () => {
      assert.ok(readmeContent.includes('Step 3') && 
        (readmeContent.includes('Chunk') || readmeContent.includes('chunk-analyzer')),
        'Should document Step 3: Chunk');
    });

    it('should document Step 4: Jump Guide', () => {
      assert.ok(readmeContent.includes('Step 4') && 
        (readmeContent.includes('Jump Guide') || readmeContent.includes('jump-guide-generator')),
        'Should document Step 4: Jump Guide');
    });

    it('should document Step 5: Notes', () => {
      assert.ok(readmeContent.includes('Step 5') && 
        (readmeContent.includes('Notes') || readmeContent.includes('notes-generator')),
        'Should document Step 5: Notes');
    });

    it('should document Step 6: Quiz', () => {
      assert.ok(readmeContent.includes('Step 6') && 
        (readmeContent.includes('Quiz') || readmeContent.includes('quiz-generator')),
        'Should document Step 6: Quiz');
    });

    it('should document Step 7: Verify', () => {
      assert.ok(readmeContent.includes('Step 7') && 
        (readmeContent.includes('Verify') || readmeContent.includes('verification-agent')),
        'Should document Step 7: Verify');
    });

    it('should document step outputs for each step', () => {
      const stepSections = readmeContent.match(/### Step \d:/g);
      assert.ok(stepSections && stepSections.length >= 7,
        'Should have detailed documentation for all 7 steps');
    });
  });

  describe('Troubleshooting Section', () => {
    it('should have Common Issues subsection', () => {
      assert.ok(readmeContent.includes('### Common Issues') ||
        readmeContent.includes('#### Issue:'),
        'Should have Common Issues or Issue subsections');
    });

    it('should document "No transcript file found" issue', () => {
      assert.ok(readmeContent.includes('No transcript file found'),
        'Should document transcript not found issue');
    });

    it('should document "VTT parse errors" issue', () => {
      assert.ok(readmeContent.includes('VTT parse') || 
        readmeContent.includes('parse errors'),
        'Should document VTT parse errors');
    });

    it('should document "Chunks too large/small" issue', () => {
      assert.ok(readmeContent.includes('Chunks too') ||
        readmeContent.includes('chunk') && readmeContent.includes('large'),
        'Should document chunk sizing issues');
    });

    it('should document "Invalid timestamp format" issue', () => {
      assert.ok(readmeContent.includes('Invalid timestamp') ||
        readmeContent.includes('timestamp format'),
        'Should document timestamp format issues');
    });

    it('should document "Quiz generation incomplete" issue', () => {
      assert.ok(readmeContent.includes('Quiz generation') ||
        readmeContent.includes('quiz') && readmeContent.includes('incomplete'),
        'Should document quiz generation issues');
    });

    it('should document "Verification failed" issue', () => {
      assert.ok(readmeContent.includes('Verification failed') ||
        readmeContent.includes('verification') && readmeContent.includes('fail'),
        'Should document verification failure issues');
    });

    it('should document "Workflow timeout" issue', () => {
      assert.ok(readmeContent.includes('timeout') || readmeContent.includes('Timeout'),
        'Should document workflow timeout issues');
    });

    it('should provide solutions for each issue', () => {
      assert.ok(readmeContent.includes('Solutions:') || readmeContent.includes('**Solutions:**'),
        'Should provide Solutions sections');
    });
  });

  describe('Configuration Documentation', () => {
    it('should document polling settings', () => {
      assert.ok(readmeContent.includes('Polling') || readmeContent.includes('polling'),
        'Should document polling settings');
    });

    it('should document timeout value (30 minutes / 1800 seconds)', () => {
      const hasTimeout = readmeContent.includes('30 minute') ||
        readmeContent.includes('1800') ||
        readmeContent.includes('30 min');
      assert.ok(hasTimeout, 'Should document timeout value');
    });
  });

  describe('Agent Documentation', () => {
    it('should mention all 7 agents', () => {
      assert.ok(readmeContent.includes('file-watcher'), 'Should mention file-watcher agent');
      assert.ok(readmeContent.includes('transcript-cleaner'), 'Should mention transcript-cleaner agent');
      assert.ok(readmeContent.includes('chunk-analyzer'), 'Should mention chunk-analyzer agent');
      assert.ok(readmeContent.includes('jump-guide-generator'), 'Should mention jump-guide-generator agent');
      assert.ok(readmeContent.includes('notes-generator'), 'Should mention notes-generator agent');
      assert.ok(readmeContent.includes('quiz-generator'), 'Should mention quiz-generator agent');
      assert.ok(readmeContent.includes('verification-agent'), 'Should mention verification-agent agent');
    });
  });
});
