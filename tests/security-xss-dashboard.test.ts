import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

test("src/server/index.html should escape dynamic content", () => {
  const htmlPath = path.join(process.cwd(), "src/server/index.html");
  const content = fs.readFileSync(htmlPath, "utf-8");

  // Check if esc function handles single quotes
  assert.ok(content.includes(".replace(/'/g,'&#39;')"), "esc function should escape single quotes");

  // Check vulnerable spots
  assert.ok(content.includes("onclick=\"openRun('${esc(run.id)}')\""), "run.id should be escaped in openRun call");
  assert.ok(content.includes("title=\"${esc(run.task)}\""), "run.task should be escaped in title attribute");
  assert.ok(content.includes(">${esc(title)}</div>"), "title should be escaped in card-title");
  assert.ok(content.includes("class=\"column-header\">${esc(step.id)}"), "step.id should be escaped in column-header");
  assert.ok(content.includes("<h2>${esc(run.workflow_id)}</h2>"), "run.workflow_id should be escaped in panel header");
  assert.ok(content.includes("class=\"step-name\" style=\"flex:1\">${esc(s.step_id)}</div>"), "s.step_id should be escaped in step-row");
  assert.ok(content.includes("class=\"step-agent\">${esc(s.agent_id"), "s.agent_id should be escaped in step-row");
  assert.ok(content.includes("${esc(s.story_id)}: ${esc(s.title)}"), "s.story_id and s.title should be escaped in story row");
});

test("esc function correctly sanitizes payloads", () => {
  // Extract esc function from the HTML file
  const htmlPath = path.join(process.cwd(), "src/server/index.html");
  const content = fs.readFileSync(htmlPath, "utf-8");
  const escMatch = content.match(/function esc\(s\) \{ (.*?) \}/);
  if (!escMatch) {
    throw new Error("Should find esc function in HTML");
  }

  // Create a function object from the body
  // The body is: if (!s) return ''; return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const escBody = escMatch[1];
  const esc = new Function("s", escBody) as (s: string) => string;

  assert.strictEqual(esc("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.strictEqual(esc("John's Store"), "John&#39;s Store");
  assert.strictEqual(esc('Double "Quote"'), "Double &quot;Quote&quot;");
  assert.strictEqual(esc("Amp & Ersand"), "Amp &amp; Ersand");
});
