import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const srcHTML = resolve(projectRoot, 'src/server/index.html');
const distHTML = resolve(projectRoot, 'dist/server/index.html');

describe('Theme Toggle Button Migration (US-011)', () => {
  const html = readFileSync(srcHTML, 'utf-8');

  describe('Theme toggle button structure', () => {
    it('should have border class', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button, 'Theme toggle button should exist');
      assert.ok(button[0].includes('border'), 'Button should have border class');
    });

    it('should have border-white/20 class for base border color', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button[0].includes('border-white/20'), 'Button should have border-white/20 class');
    });

    it('should have rounded-md class', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button[0].includes('rounded-md'), 'Button should have rounded-md class');
    });

    it('should have text-white class', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button[0].includes('text-white'), 'Button should have text-white class');
    });

    it('should have cursor-pointer class', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button[0].includes('cursor-pointer'), 'Button should have cursor-pointer class');
    });

    it('should have px-2 class for horizontal padding', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button[0].includes('px-2'), 'Button should have px-2 class');
    });

    it('should have py-1 class for vertical padding', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button[0].includes('py-1'), 'Button should have py-1 class');
    });

    it('should have text-base class for font size', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button[0].includes('text-base'), 'Button should have text-base class');
    });

    it('should have leading-none class for line height', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button[0].includes('leading-none'), 'Button should have leading-none class');
    });

    it('should have transition-colors class', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button[0].includes('transition-colors'), 'Button should have transition-colors class');
    });

    it('should have hover:border-white/50 class for hover effect', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button[0].includes('hover:border-white/50'), 'Button should have hover:border-white/50 class');
    });

    it('should have bg-transparent class for background', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button[0].includes('bg-transparent'), 'Button should have bg-transparent class');
    });

    it('should not have theme-toggle CSS class', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(!button[0].includes('class="theme-toggle'), 'Button should not have theme-toggle CSS class');
    });

    it('should not have inline style attribute', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(!button[0].includes('style='), 'Button should not have inline style attribute');
    });

    it('should have id="theme-toggle"', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button[0].includes('id="theme-toggle"'), 'Button should have id="theme-toggle"');
    });

    it('should have title attribute for accessibility', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button[0].includes('title="Toggle light/dark mode"'), 'Button should have title attribute');
    });

    it('should have aria-label attribute for accessibility', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button[0].includes('aria-label="Toggle light/dark mode"'), 'Button should have aria-label attribute');
    });

    it('should contain sun emoji initially', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>([^<]+)<\/button>/);
      assert.ok(button, 'Button should have content');
      assert.ok(button[1].includes('☀️'), 'Button should contain sun emoji initially');
    });
  });

  describe('CSS removal', () => {
    it('should not have .theme-toggle:hover CSS rule', () => {
      assert.ok(!html.includes('.theme-toggle:hover'), '.theme-toggle:hover CSS rule should be removed');
    });

    it('should have migration comment for theme toggle', () => {
      assert.ok(html.includes('/* Theme toggle migrated to Tailwind classes */'), 'Should have migration comment');
    });

    it('should preserve .medic-badge:hover CSS rule', () => {
      assert.ok(html.includes('.medic-badge:hover'), '.medic-badge:hover CSS rule should be preserved');
    });
  });

  describe('Functional preservation', () => {
    it('should preserve initTheme function', () => {
      assert.ok(html.includes('function initTheme()'), 'initTheme function should be preserved');
    });

    it('should preserve getEffectiveTheme function', () => {
      assert.ok(html.includes('function getEffectiveTheme()'), 'getEffectiveTheme function should be preserved');
    });

    it('should preserve applyTheme function', () => {
      assert.ok(html.includes('function applyTheme(theme)'), 'applyTheme function should be preserved');
    });

    it('should preserve theme toggle click event listener', () => {
      assert.ok(html.includes("btn.addEventListener('click'"), 'Click event listener should be preserved');
    });

    it('should preserve localStorage theme storage', () => {
      assert.ok(html.includes("localStorage.setItem(STORAGE_KEY, next)"), 'localStorage usage should be preserved');
    });

    it('should preserve theme emoji logic (sun for light, moon for dark)', () => {
      assert.ok(html.includes("btn.textContent = theme === 'dark' ? '🌙' : '☀️'"), 'Theme emoji logic should be preserved');
    });

    it('should preserve data-theme attribute toggle', () => {
      assert.ok(html.includes('root.setAttribute'), 'data-theme attribute logic should be preserved');
    });

    it('should preserve system preference change listener', () => {
      assert.ok(html.includes("window.matchMedia('(prefers-color-scheme: dark)').addEventListener"), 'System preference listener should be preserved');
    });

    it('should preserve theme toggle initialization', () => {
      assert.ok(html.includes('applyTheme(getEffectiveTheme())'), 'Theme initialization should be preserved');
    });

    it('should preserve button title change on theme toggle', () => {
      assert.ok(html.includes("btn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"), 'Button title change should be preserved');
    });
  });

  describe('Build output', () => {
    it('should have dist/server/index.html file', () => {
      assert.ok(existsSync(distHTML), 'dist/server/index.html should exist after build');
    });

    it('should have migrated button in dist output', () => {
      if (existsSync(distHTML)) {
        const distContent = readFileSync(distHTML, 'utf-8');
        const button = distContent.match(/<button[^>]*id="theme-toggle"[^>]*>/);
        assert.ok(button, 'Button should exist in dist output');
        assert.ok(button[0].includes('border-white/20'), 'Button should have border-white/20 in dist');
        assert.ok(button[0].includes('hover:border-white/50'), 'Button should have hover:border-white/50 in dist');
        assert.ok(button[0].includes('bg-transparent'), 'Button should have bg-transparent in dist');
      }
    });
  });

  describe('Responsive design', () => {
    it('should display in header with flex layout', () => {
      const header = html.match(/<header[^>]*>([\s\S]*?)<\/header>/);
      assert.ok(header, 'Header should exist');
      assert.ok(header[0].includes('id="theme-toggle"'), 'Theme toggle should be in header');
      assert.ok(header[0].includes('flex'), 'Header should use flex layout');
    });

    it('should maintain padding for click target size', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button[0].includes('px-2') && button[0].includes('py-1'), 'Button should have adequate padding for touch targets');
    });

    it('should maintain rounded corners', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button[0].includes('rounded-md'), 'Button should have rounded corners');
    });
  });

  describe('Hover effects', () => {
    it('should have border color transition', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button[0].includes('transition-colors'), 'Button should have transition-colors for smooth hover');
    });

    it('should change border color on hover', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button[0].includes('hover:border-white/50'), 'Button should change border color on hover');
    });

    it('should maintain cursor pointer on hover', () => {
      const button = html.match(/<button[^>]*id="theme-toggle"[^>]*>/);
      assert.ok(button[0].includes('cursor-pointer'), 'Button should show pointer cursor');
    });
  });
});
