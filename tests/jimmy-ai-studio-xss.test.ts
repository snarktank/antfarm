import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');

test('jimmy-ai-studio: sanitize.js utility exists', () => {
  const sanitizePath = join(REPO_ROOT, 'jimmy-ai-studio/frontend/sanitize.js');
  const content = readFileSync(sanitizePath, 'utf-8');
  
  assert.ok(content.includes('sanitize'), 'sanitize.js should define sanitize utility');
  assert.ok(content.includes('escapeHtml'), 'sanitize.js should have escapeHtml function');
});

test('jimmy-ai-studio: task-queue.js uses sanitization', () => {
  const filePath = join(REPO_ROOT, 'jimmy-ai-studio/frontend/task-queue.js');
  const content = readFileSync(filePath, 'utf-8');
  
  // Check that user-controlled data is sanitized
  assert.ok(content.includes('sanitize.text(task.title)'), 'task.title should be sanitized');
  assert.ok(content.includes('sanitize.text(task.description'), 'task.description should be sanitized');
  assert.ok(content.includes('sanitize.text(task.priority)'), 'task.priority should be sanitized');
  
  // Ensure raw user data is not used directly in innerHTML
  assert.ok(!content.match(/\${task\.title}[^}]/), 'task.title should not be used raw in template');
});

test('jimmy-ai-studio: security-monitoring.js uses sanitization', () => {
  const filePath = join(REPO_ROOT, 'jimmy-ai-studio/frontend/security-monitoring.js');
  const content = readFileSync(filePath, 'utf-8');
  
  // Check service names are sanitized
  assert.ok(content.includes('sanitize.text(svc.name)'), 'service names should be sanitized');
  
  // Check event data is sanitized
  assert.ok(content.includes('sanitize.text(e.message)'), 'event messages should be sanitized');
  assert.ok(content.includes('sanitize.text(e.ip)'), 'IP addresses should be sanitized');
  
  // Check IP addresses in top offenders are sanitized
  assert.ok(content.includes('sanitize.text(b.ip)'), 'blocked IPs should be sanitized');
  assert.ok(content.includes('sanitize.text(ip.ip)'), 'top offender IPs should be sanitized');
});

test('jimmy-ai-studio: dashboard.html loads sanitize.js', () => {
  const filePath = join(REPO_ROOT, 'jimmy-ai-studio/frontend/dashboard.html');
  const content = readFileSync(filePath, 'utf-8');
  
  assert.ok(content.includes('sanitize.js'), 'dashboard.html should load sanitize.js');
  
  // Verify sanitize.js is loaded before security-monitoring.js
  const sanitizeIdx = content.indexOf('sanitize.js');
  const securityIdx = content.indexOf('security-monitoring.js');
  assert.ok(sanitizeIdx < securityIdx, 'sanitize.js should be loaded before security-monitoring.js');
});

test('jimmy-ai-studio: XSS payloads would be escaped', () => {
  // Simulate the sanitize function behavior
  const escapeHtml = (text: string) => {
    const div = { textContent: text, innerHTML: '' };
    // Simulate browser behavior: textContent assignment escapes HTML
    div.innerHTML = text.replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#039;');
    return div.innerHTML;
  };
  
  const xssPayloads = [
    '<script>alert("xss")</script>',
    '<img src=x onerror=alert("xss")>',
    'javascript:alert("xss")',
    '<svg onload=alert("xss")>',
    '"><script>alert("xss")</script>'
  ];
  
  for (const payload of xssPayloads) {
    const escaped = escapeHtml(payload);
    assert.ok(!escaped.includes('<script'), `Payload should not contain <script: ${payload}`);
    assert.ok(!escaped.includes('onerror='), `Payload should not contain onerror=: ${payload}`);
    assert.ok(!escaped.includes('javascript:'), `Payload should not contain javascript:: ${payload}`);
    assert.ok(!escaped.includes('onload='), `Payload should not contain onload=: ${payload}`);
  }
});
