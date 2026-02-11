import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const landingDir = resolve(__dirname, '..');

describe('Contact page', () => {
  it('contact.html exists', () => {
    assert.ok(existsSync(resolve(landingDir, 'contact.html')));
  });

  it('contact.html includes viewport meta and non-empty title', () => {
    const html = readFileSync(resolve(landingDir, 'contact.html'), 'utf-8');
    assert.ok(html.includes('meta name="viewport"'), 'missing viewport meta');
    assert.match(html, /<title>\s*[^<]+\s*<\/title>/i, 'missing non-empty title');
  });

  it('contact.html includes inline style with a responsive @media rule', () => {
    const html = readFileSync(resolve(landingDir, 'contact.html'), 'utf-8');
    assert.match(html, /<style>[\s\S]*?<\/style>/i, 'missing inline <style> block');
    assert.ok(html.includes('@media'), 'missing responsive @media rule');
  });

  it('contact.html has exactly one form with required fields and submit button', () => {
    const html = readFileSync(resolve(landingDir, 'contact.html'), 'utf-8');

    const forms = [...html.matchAll(/<form\b/gi)];
    assert.equal(forms.length, 1, 'expected exactly one <form> element');

    // Name
    assert.ok(html.includes('for="name"'), 'missing label for name');
    assert.match(html, /<input[^>]*id="name"/i, 'missing name input id');
    assert.match(html, /<input[^>]*name="name"/i, 'missing name input name');

    // Email
    assert.ok(html.includes('for="email"'), 'missing label for email');
    assert.match(html, /<input[^>]*id="email"/i, 'missing email input id');
    assert.match(html, /<input[^>]*name="email"/i, 'missing email input name');
    assert.match(html, /<input[^>]*type="email"/i, 'missing email input type');

    // Message
    assert.ok(html.includes('for="message"'), 'missing label for message');
    assert.match(html, /<textarea[^>]*id="message"/i, 'missing message textarea id');
    assert.match(html, /<textarea[^>]*name="message"/i, 'missing message textarea name');

    // Submit button
    assert.match(html, /<button[^>]*type="submit"/i, 'missing submit button');
  });

  it('contact.html includes client-side email validation wiring and accessible inline error message', () => {
    const html = readFileSync(resolve(landingDir, 'contact.html'), 'utf-8');

    // Accessible error element
    assert.match(html, /id="email-error"/i, 'missing #email-error element');
    assert.match(html, /aria-live="polite"/i, 'missing aria-live="polite" on email error');

    // Email input wired to error element
    assert.match(
      html,
      /<input[^>]*id="email"[^>]*aria-describedby="email-error"/i,
      'missing aria-describedby linking email input to #email-error',
    );

    // Validation helper exists (mechanically verifiable marker)
    assert.match(html, /function\s+isValidEmail\s*\(/, 'missing isValidEmail(email) helper');

    // Submit handler hook exists
    assert.match(html, /addEventListener\(\s*['"]submit['"]\s*,/i, 'missing submit event handler');
  });
});
