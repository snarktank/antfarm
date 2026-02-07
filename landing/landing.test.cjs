/**
 * Landing Page Tests
 * 
 * Tests to verify the landing page structure and content.
 * Run with: node landing.test.js
 */

const fs = require('fs');
const path = require('path');

const LANDING_DIR = __dirname;
const HTML_PATH = path.join(LANDING_DIR, 'index.html');
const CSS_PATH = path.join(LANDING_DIR, 'styles.css');
const LOGO_PATH = path.join(LANDING_DIR, '..', 'assets', 'logo.jpeg');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test file existence
test('index.html exists', () => {
  assert(fs.existsSync(HTML_PATH), 'index.html should exist');
});

test('styles.css exists', () => {
  assert(fs.existsSync(CSS_PATH), 'styles.css should exist');
});

test('logo.jpeg exists in assets', () => {
  assert(fs.existsSync(LOGO_PATH), 'logo.jpeg should exist in assets directory');
});

// Read HTML content for content tests
const html = fs.existsSync(HTML_PATH) ? fs.readFileSync(HTML_PATH, 'utf8') : '';

// Test HTML structure
test('HTML has proper doctype', () => {
  assert(html.toLowerCase().includes('<!doctype html>'), 'Should have HTML5 doctype');
});

test('HTML has proper meta viewport', () => {
  assert(html.includes('viewport'), 'Should have viewport meta tag for mobile responsiveness');
});

test('HTML has title', () => {
  assert(html.includes('<title>'), 'Should have a title tag');
  assert(html.includes('Antfarm'), 'Title should mention Antfarm');
});

test('HTML links to stylesheet', () => {
  assert(html.includes('styles.css'), 'Should link to styles.css');
});

// Test required content sections
test('Page has navigation', () => {
  assert(html.includes('class="nav'), 'Should have navigation');
});

test('Page has hero section', () => {
  assert(html.includes('class="hero'), 'Should have hero section');
});

test('Page has features section', () => {
  assert(html.includes('id="features"'), 'Should have features section');
});

test('Page has how-it-works section', () => {
  assert(html.includes('id="how-it-works"'), 'Should have how-it-works section');
});

test('Page has quickstart section', () => {
  assert(html.includes('id="quickstart"'), 'Should have quickstart section');
});

test('Page has footer', () => {
  assert(html.includes('class="footer'), 'Should have footer');
});

// Test key content
test('Page explains what Antfarm is', () => {
  assert(html.includes('workflow'), 'Should mention workflows');
  assert(html.includes('OpenClaw'), 'Should mention OpenClaw');
});

test('Page explains cron-based orchestration', () => {
  assert(html.toLowerCase().includes('cron'), 'Should explain cron-based orchestration');
});

test('Page explains agent spawning', () => {
  assert(html.toLowerCase().includes('spawn'), 'Should explain agent spawning');
});

test('Page explains workflow definitions', () => {
  assert(html.includes('workflow.yml') || html.includes('workflow definition'), 'Should explain workflow definitions');
});

test('Page includes the logo', () => {
  assert(html.includes('logo.jpeg'), 'Should include the logo image');
});

test('Page has install command', () => {
  assert(html.includes('npm install') || html.includes('antfarm workflow install'), 'Should have installation command');
});

// Test CSS content
const css = fs.existsSync(CSS_PATH) ? fs.readFileSync(CSS_PATH, 'utf8') : '';

test('CSS has responsive breakpoints', () => {
  assert(css.includes('@media'), 'Should have media queries for responsive design');
});

test('CSS uses CSS variables', () => {
  assert(css.includes(':root') && css.includes('--'), 'Should use CSS custom properties');
});

test('CSS has styling for all main sections', () => {
  assert(css.includes('.hero'), 'Should style hero section');
  assert(css.includes('.features'), 'Should style features section');
  assert(css.includes('.footer'), 'Should style footer');
});

// Summary
console.log('\n' + '='.repeat(40));
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));

process.exit(failed > 0 ? 1 : 0);
