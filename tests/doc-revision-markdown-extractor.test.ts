import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractMarkdownComments } from '../dist/lib/doc-revision/markdown-extractor.js';

describe('Markdown Comment Extractor', () => {
  it('should extract single-line comments', () => {
    const content = `# Document Title

This is a paragraph.
%% This is a comment %%
More content here.`;

    const result = extractMarkdownComments(content);
    
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].commentText, 'This is a comment');
    assert.strictEqual(result[0].lineNumber, 4);
    assert.deepStrictEqual(result[0].contextBefore, ['', 'This is a paragraph.']);
    assert.deepStrictEqual(result[0].contextAfter, ['More content here.']);
  });

  it('should extract multi-line comments', () => {
    const content = `# Title

Some text before.
%%
This is a multi-line
comment with details.
%%
Text after.`;

    const result = extractMarkdownComments(content);
    
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].commentText, 'This is a multi-line comment with details.');
    assert.strictEqual(result[0].lineNumber, 4);
    assert.deepStrictEqual(result[0].contextBefore, ['', 'Some text before.']);
    assert.deepStrictEqual(result[0].contextAfter, ['Text after.']);
  });

  it('should extract multiple comments', () => {
    const content = `# Title

First paragraph.
%% Comment one %%
Second paragraph.
%% Comment two %%
Third paragraph.`;

    const result = extractMarkdownComments(content);
    
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].commentText, 'Comment one');
    assert.strictEqual(result[0].lineNumber, 4);
    assert.strictEqual(result[1].commentText, 'Comment two');
    assert.strictEqual(result[1].lineNumber, 6);
  });

  it('should handle comments at file start with limited context', () => {
    const content = `%% Comment at start %%
First line of content.
Second line.`;

    const result = extractMarkdownComments(content);
    
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].commentText, 'Comment at start');
    assert.strictEqual(result[0].lineNumber, 1);
    assert.deepStrictEqual(result[0].contextBefore, []);
    assert.deepStrictEqual(result[0].contextAfter, ['First line of content.', 'Second line.']);
  });

  it('should handle comments at file end with limited context', () => {
    const content = `First line.
Second line.
Third line.
%% Comment at end %%`;

    const result = extractMarkdownComments(content);
    
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].commentText, 'Comment at end');
    assert.strictEqual(result[0].lineNumber, 4);
    assert.deepStrictEqual(result[0].contextBefore, ['Second line.', 'Third line.']);
    assert.deepStrictEqual(result[0].contextAfter, []);
  });

  it('should skip empty comments', () => {
    const content = `# Title

Some text.
%% %%
More text.
%%

%%
Even more.`;

    const result = extractMarkdownComments(content);
    
    assert.strictEqual(result.length, 0);
  });

  it('should handle comments with only one line of context', () => {
    const content = `First line.
%% Comment here %%
Third line.`;

    const result = extractMarkdownComments(content);
    
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0].contextBefore, ['First line.']);
    assert.deepStrictEqual(result[0].contextAfter, ['Third line.']);
  });

  it('should preserve whitespace in context lines', () => {
    const content = `  Indented line.
    More indented.
%% Comment %%
  Also indented.`;

    const result = extractMarkdownComments(content);
    
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].contextBefore[0], '  Indented line.');
    assert.strictEqual(result[0].contextBefore[1], '    More indented.');
    assert.strictEqual(result[0].contextAfter[0], '  Also indented.');
  });

  it('should handle multi-line comment with text on opening line', () => {
    const content = `Before.
%% This starts here
and continues here
%%
After.`;

    const result = extractMarkdownComments(content);
    
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].commentText, 'This starts here and continues here');
    assert.strictEqual(result[0].lineNumber, 2);
  });

  it('should handle multi-line comment with text on closing line', () => {
    const content = `Before.
%%
This is the comment
and ends here %%
After.`;

    const result = extractMarkdownComments(content);
    
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].commentText, 'This is the comment and ends here');
    assert.strictEqual(result[0].lineNumber, 2);
  });

  it('should handle adjacent comments', () => {
    const content = `Before.
%% First comment %%
%% Second comment %%
After.`;

    const result = extractMarkdownComments(content);
    
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].commentText, 'First comment');
    assert.strictEqual(result[1].commentText, 'Second comment');
  });

  it('should handle nested %% markers (treat first pair as comment)', () => {
    const content = `Before.
%% This has %% nested markers %%
After.`;

    const result = extractMarkdownComments(content);
    
    // The current implementation will treat the first %% %% as the comment
    assert.strictEqual(result.length, 1);
    // First comment ends at first closing %%
    assert.strictEqual(result[0].commentText, 'This has');
  });

  it('should extract 2 lines of context before and after', () => {
    const content = `Line 1
Line 2
Line 3
Line 4
%% Comment %%
Line 6
Line 7
Line 8
Line 9`;

    const result = extractMarkdownComments(content);
    
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].contextBefore.length, 2);
    assert.deepStrictEqual(result[0].contextBefore, ['Line 3', 'Line 4']);
    assert.strictEqual(result[0].contextAfter.length, 2);
    assert.deepStrictEqual(result[0].contextAfter, ['Line 6', 'Line 7']);
  });

  it('should handle file with no comments', () => {
    const content = `# Just a regular markdown file

With no comments at all.
Just normal content.`;

    const result = extractMarkdownComments(content);
    
    assert.strictEqual(result.length, 0);
  });

  it('should handle unclosed comment (no extraction)', () => {
    const content = `Before.
%% This comment never closes
After.`;

    const result = extractMarkdownComments(content);
    
    // Unclosed comments should not be extracted
    assert.strictEqual(result.length, 0);
  });
});
