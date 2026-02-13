#!/usr/bin/env node
/**
 * Reads the version from package.json and updates version references
 * across landing/index.html, README.md, and scripts/install.sh.
 * Idempotent — re-running produces identical output.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;

// --- landing/index.html ---
const htmlPath = join(root, "landing", "index.html");
let html = readFileSync(htmlPath, "utf8");

// Version badge
html = html.replace(/v\{\{VERSION\}\}/g, `v${version}`);
html = html.replace(
  /(class="version-badge">v)\d+\.\d+\.\d+[^<]*/g,
  `$1${version}`
);

// Curl URLs: replace tagged version in raw.githubusercontent URLs
html = html.replace(
  /raw\.githubusercontent\.com\/snarktank\/antfarm\/v[\d.]+\//g,
  `raw.githubusercontent.com/snarktank/antfarm/v${version}/`
);

writeFileSync(htmlPath, html, "utf8");
console.log(`Injected version ${version} into landing/index.html`);

// --- README.md ---
const readmePath = join(root, "README.md");
if (existsSync(readmePath)) {
  let readme = readFileSync(readmePath, "utf8");
  readme = readme.replace(
    /raw\.githubusercontent\.com\/snarktank\/antfarm\/v[\d.]+\//g,
    `raw.githubusercontent.com/snarktank/antfarm/v${version}/`
  );
  writeFileSync(readmePath, readme, "utf8");
  console.log(`Injected version ${version} into README.md`);
}

// --- scripts/install.sh ---
const installPath = join(root, "scripts", "install.sh");
if (existsSync(installPath)) {
  let install = readFileSync(installPath, "utf8");
  install = install.replace(
    /raw\.githubusercontent\.com\/snarktank\/antfarm\/v[\d.]+\//g,
    `raw.githubusercontent.com/snarktank/antfarm/v${version}/`
  );
  writeFileSync(installPath, install, "utf8");
  console.log(`Injected version ${version} into scripts/install.sh`);
}
