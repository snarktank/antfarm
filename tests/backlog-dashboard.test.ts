import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve to repo root (works from both tests/ and dist/tests/)
const repoRoot = __dirname.includes("dist") ? path.resolve(__dirname, "..", "..") : path.resolve(__dirname, "..");
const htmlPath = path.join(repoRoot, "src", "server", "index.html");
const html = fs.readFileSync(htmlPath, "utf-8");

describe("Backlog Dashboard UI - HTML structure", () => {
  it("has backlog column CSS class", () => {
    assert.ok(html.includes(".backlog-col{"), "should define backlog-col CSS");
  });

  it("has backlog form CSS", () => {
    assert.ok(html.includes(".backlog-form{"), "should define backlog-form CSS");
    assert.ok(html.includes(".backlog-form input"), "should style form inputs");
    assert.ok(html.includes(".backlog-form button"), "should style form button");
  });

  it("has dispatch button CSS", () => {
    assert.ok(html.includes(".dispatch-btn"), "should have dispatch button style");
  });

  it("has workflow badge CSS", () => {
    assert.ok(html.includes(".badge-workflow{"), "should have workflow badge style");
  });

  it("has backlog status badge variants", () => {
    assert.ok(html.includes(".badge-backlog-draft{"), "should have draft badge");
    assert.ok(html.includes(".badge-backlog-ready{"), "should have ready badge");
    assert.ok(html.includes(".badge-backlog-dispatched{"), "should have dispatched badge");
  });
});

describe("Backlog Dashboard UI - JavaScript functions", () => {
  it("has loadBacklog function", () => {
    assert.ok(html.includes("async function loadBacklog()"), "should define loadBacklog");
    assert.ok(html.includes("/api/backlog"), "should fetch from /api/backlog");
  });

  it("has renderBacklogColumn function", () => {
    assert.ok(html.includes("function renderBacklogColumn()"), "should define renderBacklogColumn");
  });

  it("has addBacklogItem function", () => {
    assert.ok(html.includes("async function addBacklogItem()"), "should define addBacklogItem");
  });

  it("has dispatchBacklog function", () => {
    assert.ok(html.includes("async function dispatchBacklog("), "should define dispatchBacklog");
  });

  it("backlog column is prepended to board (leftmost)", () => {
    assert.ok(html.includes("renderBacklogColumn() + wf.steps.map"), "backlog column should be leftmost");
  });

  it("auto-refresh interval reloads backlog", () => {
    assert.ok(html.includes("await loadBacklog()"), "refresh should call loadBacklog");
    // Verify it's inside setInterval
    const intervalMatch = html.match(/setInterval\(async.*loadBacklog/s);
    assert.ok(intervalMatch, "loadBacklog should be in setInterval");
  });
});

describe("Backlog Dashboard UI - Form elements", () => {
  it("has title input", () => {
    assert.ok(html.includes('id="bl-title"'), "should have title input");
    assert.ok(html.includes('placeholder="Title"'), "should have title placeholder");
  });

  it("has description textarea", () => {
    assert.ok(html.includes('id="bl-desc"'), "should have description textarea");
    assert.ok(html.includes("<textarea"), "should use textarea element");
  });

  it("has workflow dropdown", () => {
    assert.ok(html.includes('id="bl-workflow"'), "should have workflow select");
    assert.ok(html.includes("— workflow —"), "should have default option");
  });

  it("form posts to /api/backlog", () => {
    assert.ok(html.includes("'/api/backlog'"), "should POST to /api/backlog");
    assert.ok(html.includes("method: 'POST'"), "should use POST method");
  });
});

describe("Backlog Dashboard UI - Card rendering", () => {
  it("cards show title", () => {
    assert.ok(html.includes("card-title"), "should have card title class");
  });

  it("cards show truncated description", () => {
    assert.ok(html.includes("card-desc"), "should have card description class");
    assert.ok(html.includes("-webkit-line-clamp:2"), "should truncate description");
  });

  it("cards show workflow badge when target_workflow set", () => {
    assert.ok(html.includes("item.target_workflow"), "should check target_workflow");
    assert.ok(html.includes("badge-workflow"), "should render workflow badge");
  });

  it("cards show status badge", () => {
    assert.ok(html.includes("badge-backlog-status"), "should have status badge class");
    assert.ok(html.includes("item.status"), "should display item status");
  });

  it("cards have dispatch button", () => {
    assert.ok(html.includes("dispatch-btn"), "should have dispatch button");
    assert.ok(html.includes("dispatchBacklog"), "dispatch button should call dispatchBacklog");
  });

  it("dispatch button disabled when no target workflow or already dispatched", () => {
    assert.ok(html.includes("isDispatched"), "should check dispatch eligibility");
    assert.ok(html.includes("item.status === 'dispatched'"), "should check not already dispatched");
  });
});


describe("Backlog Dashboard UI - Auto-refresh regression", () => {
  it("separates backlog form from backlog cards rendering", () => {
    assert.ok(html.includes("function renderBacklogForm()"), "should render form separately");
    assert.ok(html.includes("function renderBacklogCards()"), "should render cards separately");
    assert.ok(html.includes('id="backlog-cards"'), "should have dedicated cards container");
    assert.ok(html.includes("function refreshBacklogCards()"), "should support cards-only refresh");
  });

  it("preserves backlog form state across board re-renders", () => {
    assert.ok(html.includes("function getBacklogFormState()"), "should capture form state before rerender");
    assert.ok(html.includes("function restoreBacklogFormState(state)"), "should restore form state after rerender");
    assert.ok(html.includes("restoreBacklogFormState(formState);"), "should restore state in board rendering paths");
  });

  it("auto-refresh updates backlog data without dropping form handling", () => {
    assert.ok(html.includes("refreshBacklogCards();"), "interval should refresh cards list");
    assert.ok(html.includes("setInterval(async () =>"), "should use periodic auto-refresh");

    const intervalBody = html.match(/setInterval\(async \(\) => \{([\s\S]*?)\}, 30000\);/);
    assert.ok(intervalBody, "should define a 30s refresh interval");
    assert.ok(!intervalBody[1].includes("refreshBoard()"), "interval should not rebuild the board when no workflow is selected");
  });
});
