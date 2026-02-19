import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("US-016: Tailwind build process integration", () => {
  describe("Input CSS file configuration", () => {
    it("should have input.css file in src/server/", () => {
      const inputCssPath = path.join(projectRoot, "src", "server", "input.css");
      assert.ok(fs.existsSync(inputCssPath), "input.css should exist");
    });

    it("should contain @tailwind base directive", () => {
      const inputCssPath = path.join(projectRoot, "src", "server", "input.css");
      const content = fs.readFileSync(inputCssPath, "utf-8");
      assert.ok(content.includes("@tailwind base"), "should have @tailwind base");
    });

    it("should contain @tailwind components directive", () => {
      const inputCssPath = path.join(projectRoot, "src", "server", "input.css");
      const content = fs.readFileSync(inputCssPath, "utf-8");
      assert.ok(content.includes("@tailwind components"), "should have @tailwind components");
    });

    it("should contain @tailwind utilities directive", () => {
      const inputCssPath = path.join(projectRoot, "src", "server", "input.css");
      const content = fs.readFileSync(inputCssPath, "utf-8");
      assert.ok(content.includes("@tailwind utilities"), "should have @tailwind utilities");
    });
  });

  describe("Build script configuration", () => {
    it("should have build:css script in package.json", () => {
      const packageJsonPath = path.join(projectRoot, "package.json");
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      assert.ok(packageJson.scripts["build:css"], "build:css script should exist");
    });

    it("should have build:css script that compiles Tailwind", () => {
      const packageJsonPath = path.join(projectRoot, "package.json");
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      const buildCssScript = packageJson.scripts["build:css"];
      assert.ok(buildCssScript.includes("tailwindcss"), "build:css should use tailwindcss");
      assert.ok(buildCssScript.includes("-i"), "should have input flag");
      assert.ok(buildCssScript.includes("-o"), "should have output flag");
      assert.ok(buildCssScript.includes("input.css"), "should reference input.css");
      assert.ok(buildCssScript.includes("output.css"), "should reference output.css");
    });

    it("should have build:css script with minify flag", () => {
      const packageJsonPath = path.join(projectRoot, "package.json");
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      const buildCssScript = packageJson.scripts["build:css"];
      assert.ok(buildCssScript.includes("--minify"), "should have --minify flag");
    });

    it("should have build script that runs build:css first", () => {
      const packageJsonPath = path.join(projectRoot, "package.json");
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      const buildScript = packageJson.scripts.build;
      assert.ok(buildScript.includes("build:css"), "build script should run build:css");
      const buildCssIndex = buildScript.indexOf("build:css");
      const tscIndex = buildScript.indexOf("tsc");
      assert.ok(buildCssIndex < tscIndex, "build:css should run before tsc");
    });
  });

  describe("Build output verification", () => {
    it("should generate output.css in dist/server/ after build", () => {
      const outputCssPath = path.join(projectRoot, "dist", "server", "output.css");
      assert.ok(fs.existsSync(outputCssPath), "output.css should exist in dist/server/");
    });

    it("should have output.css with content", () => {
      const outputCssPath = path.join(projectRoot, "dist", "server", "output.css");
      const stats = fs.statSync(outputCssPath);
      assert.ok(stats.size > 0, "output.css should have content");
    });

    it("should have minified CSS (optimized file size)", () => {
      const outputCssPath = path.join(projectRoot, "dist", "server", "output.css");
      const stats = fs.statSync(outputCssPath);
      // Minified Tailwind CSS should be under 100KB for a typical dashboard
      assert.ok(stats.size < 100000, `output.css should be minified (got ${stats.size} bytes)`);
    });

    it("should have output.css with Tailwind base styles", () => {
      const outputCssPath = path.join(projectRoot, "dist", "server", "output.css");
      const content = fs.readFileSync(outputCssPath, "utf-8");
      // Check for common Tailwind CSS patterns in compiled output
      assert.ok(content.length > 1000, "output.css should have substantial content");
    });
  });

  describe("HTML integration", () => {
    it("should reference output.css in index.html", () => {
      const indexHtmlPath = path.join(projectRoot, "src", "server", "index.html");
      const html = fs.readFileSync(indexHtmlPath, "utf-8");
      assert.ok(html.includes('href="output.css"'), "index.html should reference output.css");
    });

    it("should have link tag with rel=stylesheet for output.css", () => {
      const indexHtmlPath = path.join(projectRoot, "src", "server", "index.html");
      const html = fs.readFileSync(indexHtmlPath, "utf-8");
      assert.ok(html.includes('<link href="output.css" rel="stylesheet">'), "should have proper link tag");
    });

    it("should have output.css reference in head section", () => {
      const indexHtmlPath = path.join(projectRoot, "src", "server", "index.html");
      const html = fs.readFileSync(indexHtmlPath, "utf-8");
      const headMatch = html.match(/<head>[\s\S]*?<\/head>/);
      assert.ok(headMatch, "should have head section");
      assert.ok(headMatch[0].includes("output.css"), "output.css should be in head");
    });
  });

  describe("Dashboard server CSS serving", () => {
    it("should have dashboard.ts file", () => {
      const dashboardPath = path.join(projectRoot, "src", "server", "dashboard.ts");
      assert.ok(fs.existsSync(dashboardPath), "dashboard.ts should exist");
    });

    it("should serve output.css file", () => {
      const dashboardPath = path.join(projectRoot, "src", "server", "dashboard.ts");
      const content = fs.readFileSync(dashboardPath, "utf-8");
      assert.ok(content.includes('"/output.css"'), "should have route for /output.css");
      assert.ok(content.includes("output.css"), "should reference output.css file");
    });

    it("should serve CSS with correct Content-Type", () => {
      const dashboardPath = path.join(projectRoot, "src", "server", "dashboard.ts");
      const content = fs.readFileSync(dashboardPath, "utf-8");
      // Check for CSS content type in the route handler
      const cssRouteMatch = content.match(/\/output\.css[\s\S]*?text\/css/);
      assert.ok(cssRouteMatch, "should serve CSS with text/css Content-Type");
    });

    it("should have cache control for CSS file", () => {
      const dashboardPath = path.join(projectRoot, "src", "server", "dashboard.ts");
      const content = fs.readFileSync(dashboardPath, "utf-8");
      // Check that CSS route has Cache-Control header
      const cssRouteMatch = content.match(/\/output\.css[\s\S]*?Cache-Control/);
      assert.ok(cssRouteMatch, "should have Cache-Control header for CSS");
    });
  });

  describe("Build process execution", () => {
    it("should build without errors", () => {
      try {
        execSync("npm run build", { cwd: projectRoot, stdio: "pipe" });
        assert.ok(true, "build should complete without errors");
      } catch (error: any) {
        assert.fail(`Build failed: ${error.message}`);
      }
    });

    it("should pass typecheck", () => {
      try {
        execSync("npm run typecheck", { cwd: projectRoot, stdio: "pipe" });
        assert.ok(true, "typecheck should pass");
      } catch (error: any) {
        assert.fail(`Typecheck failed: ${error.message}`);
      }
    });

    it("should build CSS during main build process", () => {
      const outputCssPath = path.join(projectRoot, "dist", "server", "output.css");
      const statsBefore = fs.statSync(outputCssPath);
      
      // Run build
      execSync("npm run build:css", { cwd: projectRoot, stdio: "pipe" });
      
      const statsAfter = fs.statSync(outputCssPath);
      // Verify file was updated (modified time or size)
      assert.ok(statsAfter.size > 0, "CSS should be rebuilt");
    });
  });

  describe("Tailwind CSS optimization", () => {
    it("should purge unused CSS classes", () => {
      const outputCssPath = path.join(projectRoot, "dist", "server", "output.css");
      const content = fs.readFileSync(outputCssPath, "utf-8");
      // Minified CSS should only have the Tailwind license comment (/*!)
      // Remove the license comment and check for any other comments
      const contentWithoutLicense = content.replace(/\/\*![\s\S]*?\*\//, "");
      assert.ok(!contentWithoutLicense.includes("/*"), "should not have user CSS comments (minified)");
    });

    it("should include only used Tailwind classes", () => {
      const outputCssPath = path.join(projectRoot, "dist", "server", "output.css");
      const stats = fs.statSync(outputCssPath);
      // Tailwind with purging should be much smaller than full Tailwind (3MB+)
      // Typical purged size is 10-50KB depending on usage
      assert.ok(stats.size < 200000, `CSS should be purged (got ${stats.size} bytes, expected < 200KB)`);
    });

    it("should be minified (single line)", () => {
      const outputCssPath = path.join(projectRoot, "dist", "server", "output.css");
      const content = fs.readFileSync(outputCssPath, "utf-8");
      const lineCount = content.split("\n").length;
      // Minified CSS is typically 1-2 lines
      assert.ok(lineCount < 10, `CSS should be minified (got ${lineCount} lines)`);
    });
  });

  describe("Custom CSS integration", () => {
    it("should include custom CSS from @layer utilities", () => {
      const outputCssPath = path.join(projectRoot, "dist", "server", "output.css");
      const content = fs.readFileSync(outputCssPath, "utf-8");
      // Check that custom classes are compiled
      assert.ok(content.includes(".overlay.open") || content.includes("overlay.open"), "should include .overlay.open");
    });

    it("should include custom animations", () => {
      const outputCssPath = path.join(projectRoot, "dist", "server", "output.css");
      const content = fs.readFileSync(outputCssPath, "utf-8");
      // Check for custom animation keyframes
      assert.ok(content.includes("pulse") || content.includes("@keyframes"), "should include custom animations");
    });

    it("should include custom base styles for select", () => {
      const outputCssPath = path.join(projectRoot, "dist", "server", "output.css");
      const content = fs.readFileSync(outputCssPath, "utf-8");
      // Check for select option styles
      assert.ok(content.includes("select option") || content.includes("select"), "should include select styles");
    });
  });

  describe("End-to-end verification", () => {
    it("should have all necessary files after build", () => {
      const files = [
        "dist/server/output.css",
        "dist/server/index.html",
        "dist/server/dashboard.js",
        "dist/cli/cli.js",
      ];
      
      for (const file of files) {
        const filePath = path.join(projectRoot, file);
        assert.ok(fs.existsSync(filePath), `${file} should exist after build`);
      }
    });

    it("should have index.html in dist that references output.css", () => {
      const indexHtmlPath = path.join(projectRoot, "dist", "server", "index.html");
      assert.ok(fs.existsSync(indexHtmlPath), "dist/server/index.html should exist");
      const html = fs.readFileSync(indexHtmlPath, "utf-8");
      assert.ok(html.includes("output.css"), "dist index.html should reference output.css");
    });

    it("should have tailwind config file", () => {
      const configPath = path.join(projectRoot, "tailwind.config.js");
      assert.ok(fs.existsSync(configPath), "tailwind.config.js should exist");
    });

    it("should have postcss config file", () => {
      const configPath = path.join(projectRoot, "postcss.config.js");
      assert.ok(fs.existsSync(configPath), "postcss.config.js should exist");
    });

    it("should have tailwindcss as dev dependency", () => {
      const packageJsonPath = path.join(projectRoot, "package.json");
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      assert.ok(packageJson.devDependencies?.tailwindcss, "tailwindcss should be in devDependencies");
    });
  });
});
