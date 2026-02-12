#!/usr/bin/env node
/**
 * Reads the version from package.json and replaces {{VERSION}} tokens
 * in landing/index.html. Idempotent — re-running produces identical output
 * because it replaces both the placeholder and any previously injected semver.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;

const htmlPath = join(root, "landing", "index.html");
let html = readFileSync(htmlPath, "utf8");

// Replace the placeholder token OR a previously injected semver string
// Matches {{VERSION}} or a semver like 1.2.3 / 0.2.3-beta.1 in the version-badge context
html = html.replace(
  /v\{\{VERSION\}\}/g,
  `v${version}`
);

// Also handle re-runs: replace previously injected version back to current version
// Match v followed by a semver in the version-badge line
html = html.replace(
  /(class="version-badge">v)\d+\.\d+\.\d+[^<]*/g,
  `$1${version}`
);

writeFileSync(htmlPath, html, "utf8");
console.log(`Injected version ${version} into landing/index.html`);
