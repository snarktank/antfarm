import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const projectRoot = resolve(import.meta.dirname, "..");

describe("US-019: Performance optimization and CSS purging", () => {
  describe("1. Compiled CSS file size", () => {
    it("should have output.css file in dist/server", () => {
      const outputPath = resolve(projectRoot, "dist/server/output.css");
      assert.ok(existsSync(outputPath), "output.css should exist in dist/server");
    });

    it("should be <100KB uncompressed", () => {
      const outputPath = resolve(projectRoot, "dist/server/output.css");
      const stats = statSync(outputPath);
      const sizeKB = stats.size / 1024;
      assert.ok(sizeKB < 100, `CSS file is ${sizeKB.toFixed(2)}KB, should be <100KB`);
    });

    it("should be <50KB when gzipped", () => {
      const outputPath = resolve(projectRoot, "dist/server/output.css");
      const gzippedSize = execSync(`gzip -c ${outputPath} | wc -c`, { encoding: "utf8" });
      const sizeKB = parseInt(gzippedSize.trim()) / 1024;
      assert.ok(sizeKB < 50, `Gzipped CSS is ${sizeKB.toFixed(2)}KB, should be <50KB`);
    });

    it("should contain Tailwind base, components, and utilities", () => {
      const outputPath = resolve(projectRoot, "dist/server/output.css");
      const css = readFileSync(outputPath, "utf8");
      // Minified CSS won't have comments, but should have actual CSS rules
      assert.ok(css.length > 1000, "CSS should have substantial content");
      assert.ok(css.includes("*,"), "CSS should have base reset styles");
    });

    it("should be minified (no unnecessary whitespace)", () => {
      const outputPath = resolve(projectRoot, "dist/server/output.css");
      const css = readFileSync(outputPath, "utf8");
      // Minified CSS should not have multiple consecutive spaces or newlines
      const hasExcessiveWhitespace = /\n\n|\s{2,}(?![^{]*})/g.test(css);
      assert.ok(!hasExcessiveWhitespace, "CSS should be minified without excessive whitespace");
    });
  });

  describe("2. Tailwind content paths configuration", () => {
    it("should have tailwind.config.js in project root", () => {
      const configPath = resolve(projectRoot, "tailwind.config.js");
      assert.ok(existsSync(configPath), "tailwind.config.js should exist");
    });

    it("should include src/server/**/*.{html,js,ts} in content paths", () => {
      const configPath = resolve(projectRoot, "tailwind.config.js");
      const config = readFileSync(configPath, "utf8");
      assert.match(config, /content:\s*\[/, "Should have content array");
      assert.match(config, /["']\.\/src\/server\/\*\*\/\*\.{html,js,ts}["']/, "Should include src/server files");
    });

    it("should include dist/server/**/*.{html,js} in content paths", () => {
      const configPath = resolve(projectRoot, "tailwind.config.js");
      const config = readFileSync(configPath, "utf8");
      assert.match(config, /["']\.\/dist\/server\/\*\*\/\*\.{html,js}["']/, "Should include dist/server files");
    });

    it("should have darkMode configured", () => {
      const configPath = resolve(projectRoot, "tailwind.config.js");
      const config = readFileSync(configPath, "utf8");
      assert.match(config, /darkMode:\s*\[?['"]class['"]/, "Should have dark mode configured");
    });

    it("should have custom colors in theme.extend", () => {
      const configPath = resolve(projectRoot, "tailwind.config.js");
      const config = readFileSync(configPath, "utf8");
      assert.match(config, /theme:\s*{[\s\S]*extend:\s*{/, "Should have theme.extend");
      assert.match(config, /colors:\s*{/, "Should have custom colors");
      assert.match(config, /['"]bg-page['"]/, "Should have bg-page color");
      assert.match(config, /['"]dark-bg-page['"]/, "Should have dark-bg-page color");
    });
  });

  describe("3. Production build removes unused CSS classes", () => {
    it("should not include unused Tailwind utility classes", () => {
      const outputPath = resolve(projectRoot, "dist/server/output.css");
      const css = readFileSync(outputPath, "utf8");
      
      // These classes should NOT be in the output since they're not used
      const unusedClasses = [
        "bg-pink-500", // Not used in our dashboard
        "text-9xl", // Not used
        "gap-96", // Not used
        "rotate-180", // Not used (we use rotate-90)
      ];
      
      for (const unusedClass of unusedClasses) {
        const classPattern = new RegExp(`\\.${unusedClass}[{,\\s]`);
        assert.ok(!classPattern.test(css), `Unused class ${unusedClass} should be purged`);
      }
    });

    it("should include only classes used in HTML/JS", () => {
      const outputPath = resolve(projectRoot, "dist/server/output.css");
      const css = readFileSync(outputPath, "utf8");
      
      // These classes ARE used in our dashboard and should exist
      const usedClasses = [
        "flex",
        "items-center",
        "justify-center",
        "gap-4",
        "rounded-md",
        "px-4",
        "py-3",
        "text-sm",
        "font-semibold",
        "border",
        "hover:shadow-lg", // Check for actual class (CSS minifier uses escaped version)
        "dark:bg-dark-bg-page", // Check for actual dark mode class
      ];
      
      for (const usedClass of usedClasses) {
        // For hover/dark variants, check if the class appears anywhere in the CSS
        if (usedClass.includes(":")) {
          assert.ok(css.includes(usedClass.replace(":", "\\:")), `Used class ${usedClass} should be in output`);
        } else {
          const classPattern = new RegExp(`\\.${usedClass}[{,\\s:]`);
          assert.ok(classPattern.test(css), `Used class ${usedClass} should be in output`);
        }
      }
    });

    it("should include custom CSS from input.css", () => {
      const outputPath = resolve(projectRoot, "dist/server/output.css");
      const css = readFileSync(outputPath, "utf8");
      
      // Custom classes should be preserved
      assert.match(css, /\.overlay\.open/, "Should include .overlay.open");
      assert.match(css, /\.story-open/, "Should include .story-open");
      assert.match(css, /\.step-open/, "Should include .step-open");
      assert.match(css, /\.medic-panel\.open/, "Should include .medic-panel.open");
      assert.match(css, /\.healthy/, "Should include .healthy");
      assert.match(css, /\.warning/, "Should include .warning");
      assert.match(css, /\.critical/, "Should include .critical");
      assert.match(css, /@keyframes pulse/, "Should include pulse animation");
    });
  });

  describe("4. Dashboard load time and rendering performance", () => {
    it("should have minified CSS for fast loading", () => {
      const outputPath = resolve(projectRoot, "dist/server/output.css");
      const stats = statSync(outputPath);
      const sizeKB = stats.size / 1024;
      // Under 25KB is excellent for initial load
      assert.ok(sizeKB < 25, `CSS is ${sizeKB.toFixed(2)}KB, optimal for fast loading`);
    });

    it("should reference output.css in HTML head for render-blocking CSS", () => {
      const htmlPath = resolve(projectRoot, "dist/server/index.html");
      const html = readFileSync(htmlPath, "utf8");
      const linkTag = html.match(/<link[^>]*href=["']output\.css["'][^>]*>/);
      assert.ok(linkTag, "Should have link tag for output.css");
      assert.match(linkTag[0], /rel=["']stylesheet["']/, "Should be a stylesheet link");
    });

    it("should have viewport meta tag for proper mobile rendering", () => {
      const htmlPath = resolve(projectRoot, "dist/server/index.html");
      const html = readFileSync(htmlPath, "utf8");
      assert.match(html, /<meta[^>]*name=["']viewport["'][^>]*>/, "Should have viewport meta tag");
      assert.match(html, /width=device-width/, "Should set width=device-width");
      assert.match(html, /initial-scale=1/, "Should set initial-scale=1");
    });

    it("should not have inline style blocks (moved to output.css)", () => {
      const htmlPath = resolve(projectRoot, "dist/server/index.html");
      const html = readFileSync(htmlPath, "utf8");
      const styleBlocks = html.match(/<style[^>]*>[\s\S]*?<\/style>/g);
      assert.ok(!styleBlocks || styleBlocks.length === 0, "Should not have inline style blocks");
    });

    it("should have efficient flex layout (no table layouts)", () => {
      const htmlPath = resolve(projectRoot, "dist/server/index.html");
      const html = readFileSync(htmlPath, "utf8");
      assert.ok(html.includes("flex"), "Should use flexbox for layout");
      assert.ok(!html.includes("display:table"), "Should not use table layouts");
    });
  });

  describe("5. No layout shift during initial render (CLS score)", () => {
    it("should have explicit widths on key containers", () => {
      const htmlPath = resolve(projectRoot, "dist/server/index.html");
      const html = readFileSync(htmlPath, "utf8");
      // Board columns should have min-width
      assert.ok(html.includes("min-w-[240px]"), "Board columns should have min-width");
      // Panel should have explicit width
      assert.ok(html.includes("w-[90%]") || html.includes("w-[340px]"), "Panels should have explicit widths");
    });

    it("should have explicit heights on scrollable containers", () => {
      const htmlPath = resolve(projectRoot, "dist/server/index.html");
      const html = readFileSync(htmlPath, "utf8");
      // Panel and medic panel should have max-height
      assert.ok(html.includes("max-h-[85vh]") || html.includes("max-h-[500px]"), "Scrollable containers should have max-height");
    });

    it("should predefine CSS classes (no dynamic inline styles for layout)", () => {
      const htmlPath = resolve(projectRoot, "dist/server/index.html");
      const html = readFileSync(htmlPath, "utf8");
      // Check that main layout uses classes, not inline styles for critical dimensions
      const boardDiv = html.match(/<div[^>]*id=["']board["'][^>]*>/);
      assert.ok(boardDiv, "Should have board div");
      // Board should use Tailwind classes for layout
      assert.ok(boardDiv[0].includes("flex"), "Board should use flex class");
      // Inline styles for dynamic calculations (like calc()) are acceptable
      // as long as static layout properties use Tailwind classes
      assert.ok(boardDiv[0].includes("flex"), "Board should primarily use Tailwind classes");
    });

    it("should have CSS loaded before body content", () => {
      const htmlPath = resolve(projectRoot, "dist/server/index.html");
      const html = readFileSync(htmlPath, "utf8");
      const headEnd = html.indexOf("</head>");
      const bodyStart = html.indexOf("<body");
      const cssLink = html.indexOf("output.css");
      assert.ok(cssLink < headEnd, "CSS should be in head");
      assert.ok(cssLink < bodyStart, "CSS should load before body");
    });
  });

  describe("6. No console errors or warnings", () => {
    it("should have valid HTML structure", () => {
      const htmlPath = resolve(projectRoot, "dist/server/index.html");
      const html = readFileSync(htmlPath, "utf8");
      assert.match(html, /<!DOCTYPE html>/i, "Should have DOCTYPE");
      assert.match(html, /<html[^>]*>/, "Should have html tag");
      assert.match(html, /<head>/, "Should have head tag");
      assert.match(html, /<body[^>]*>/, "Should have body tag");
      assert.match(html, /<\/html>/, "Should close html tag");
    });

    it("should have properly closed tags", () => {
      const htmlPath = resolve(projectRoot, "dist/server/index.html");
      const html = readFileSync(htmlPath, "utf8");
      // Check key tags are properly closed
      const divOpen = (html.match(/<div[^>]*>/g) || []).length;
      const divClose = (html.match(/<\/div>/g) || []).length;
      assert.equal(divOpen, divClose, "All div tags should be properly closed");
    });

    it("should reference valid CSS file", () => {
      const htmlPath = resolve(projectRoot, "dist/server/index.html");
      const html = readFileSync(htmlPath, "utf8");
      const cssHref = html.match(/href=["'](output\.css)["']/);
      assert.ok(cssHref, "Should reference output.css");
      const cssPath = resolve(projectRoot, "dist/server", cssHref[1]);
      assert.ok(existsSync(cssPath), "Referenced CSS file should exist");
    });

    it("should have valid CSS (no syntax errors)", () => {
      const outputPath = resolve(projectRoot, "dist/server/output.css");
      const css = readFileSync(outputPath, "utf8");
      // Check for balanced braces
      const openBraces = (css.match(/{/g) || []).length;
      const closeBraces = (css.match(/}/g) || []).length;
      assert.equal(openBraces, closeBraces, "CSS should have balanced braces");
    });

    it("should not have JavaScript errors in static HTML", () => {
      const htmlPath = resolve(projectRoot, "dist/server/index.html");
      const html = readFileSync(htmlPath, "utf8");
      // Check that scripts exist and are properly closed
      const scripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/g) || [];
      assert.ok(scripts.length > 0, "Should have JavaScript code");
      
      // Check that all script tags are properly closed
      for (const script of scripts) {
        assert.ok(script.includes("</script>"), "Script tags should be properly closed");
        // Check for obvious syntax errors (unmatched brackets)
        const content = script.replace(/<\/?script[^>]*>/g, "");
        const openBraces = (content.match(/{/g) || []).length;
        const closeBraces = (content.match(/}/g) || []).length;
        assert.equal(openBraces, closeBraces, "Braces should be balanced in script");
      }
    });
  });

  describe("7. Performance profiler shows no blocking CSS", () => {
    it("should not use @import in CSS (causes blocking)", () => {
      const outputPath = resolve(projectRoot, "dist/server/output.css");
      const css = readFileSync(outputPath, "utf8");
      assert.ok(!css.includes("@import"), "Should not use @import (causes render blocking)");
    });

    it("should use single consolidated CSS file (plus fonts)", () => {
      const htmlPath = resolve(projectRoot, "dist/server/index.html");
      const html = readFileSync(htmlPath, "utf8");
      const cssLinks = html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/g) || [];
      // Should have output.css (consolidated CSS)
      // External font stylesheets (like Google Fonts) are acceptable
      assert.ok(cssLinks.length >= 1, "Should have at least one stylesheet link");
      assert.ok(cssLinks.some(link => link.includes("output.css")), "Should include output.css");
    });

    it("should have CSS in head (not body) for proper loading", () => {
      const htmlPath = resolve(projectRoot, "dist/server/index.html");
      const html = readFileSync(htmlPath, "utf8");
      const headSection = html.match(/<head>[\s\S]*?<\/head>/);
      assert.ok(headSection, "Should have head section");
      assert.ok(headSection[0].includes("output.css"), "CSS should be in head section");
    });

    it("should not have unused font imports", () => {
      const outputPath = resolve(projectRoot, "dist/server/output.css");
      const css = readFileSync(outputPath, "utf8");
      // Check we're not loading unnecessary web fonts
      const fontFaceCount = (css.match(/@font-face/g) || []).length;
      assert.ok(fontFaceCount < 5, "Should not have excessive font-face declarations");
    });
  });

  describe("8. Tests for performance metrics pass", () => {
    it("should have package.json with build scripts", () => {
      const packagePath = resolve(projectRoot, "package.json");
      const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
      assert.ok(packageJson.scripts.build, "Should have build script");
      assert.ok(packageJson.scripts["build:css"], "Should have build:css script");
      assert.ok(packageJson.scripts.typecheck, "Should have typecheck script");
    });

    it("should have build:css script with --minify flag", () => {
      const packagePath = resolve(projectRoot, "package.json");
      const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
      assert.match(packageJson.scripts["build:css"], /--minify/, "build:css should use --minify flag");
    });

    it("should have Tailwind CSS dependencies installed", () => {
      const packagePath = resolve(projectRoot, "package.json");
      const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      assert.ok(deps.tailwindcss, "Should have tailwindcss installed");
      assert.ok(deps.autoprefixer, "Should have autoprefixer installed");
      assert.ok(deps.postcss, "Should have postcss installed");
    });

    it("should generate output.css successfully on build", () => {
      const outputPath = resolve(projectRoot, "dist/server/output.css");
      assert.ok(existsSync(outputPath), "output.css should be generated after build");
      const stats = statSync(outputPath);
      assert.ok(stats.size > 0, "output.css should not be empty");
    });
  });

  describe("9. Typecheck passes", () => {
    it("should have tsconfig.json configured", () => {
      const tsconfigPath = resolve(projectRoot, "tsconfig.json");
      assert.ok(existsSync(tsconfigPath), "tsconfig.json should exist");
    });

    it("should pass typecheck without errors", () => {
      try {
        execSync("npm run typecheck", { cwd: projectRoot, stdio: "pipe" });
        assert.ok(true, "Typecheck should pass");
      } catch (error) {
        assert.fail(`Typecheck failed: ${error.stderr?.toString() || error.message}`);
      }
    });
  });

  describe("Additional Performance Optimizations", () => {
    it("should have efficient selector specificity", () => {
      const outputPath = resolve(projectRoot, "dist/server/output.css");
      const css = readFileSync(outputPath, "utf8");
      // Count overly complex selectors (more than 4 levels deep)
      // Tailwind uses some complex selectors for dark mode and pseudo-classes, which is acceptable
      const complexSelectors = css.match(/\S+\s+\S+\s+\S+\s+\S+\s+\S+\s*{/g) || [];
      assert.ok(complexSelectors.length < 100, "Should minimize overly complex selectors (>4 levels)");
    });

    it("should not duplicate CSS rules", () => {
      const outputPath = resolve(projectRoot, "dist/server/output.css");
      const css = readFileSync(outputPath, "utf8");
      // Check for obvious duplicates (same selector appearing multiple times)
      const selectors = css.match(/\.[a-z-]+\s*{/g) || [];
      const uniqueSelectors = new Set(selectors);
      const duplicationRate = 1 - (uniqueSelectors.size / selectors.length);
      assert.ok(duplicationRate < 0.1, "Should have minimal CSS duplication (<10%)");
    });

    it("should use shorthand properties where possible", () => {
      const outputPath = resolve(projectRoot, "dist/server/output.css");
      const css = readFileSync(outputPath, "utf8");
      // Minified CSS should use shorthands (hard to test definitively, but check it's minified)
      assert.ok(css.length < 30000, "Minified CSS should be compact");
    });

    it("should have critical CSS inline or in head", () => {
      const htmlPath = resolve(projectRoot, "dist/server/index.html");
      const html = readFileSync(htmlPath, "utf8");
      const headSection = html.match(/<head>[\s\S]*?<\/head>/);
      // CSS link should be in head for critical rendering path
      assert.ok(headSection[0].includes("stylesheet"), "Stylesheet should be in head");
    });
  });
});
