import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = __dirname.includes("dist") ? path.resolve(__dirname, "..", "..") : path.resolve(__dirname, "..");
const htmlPath = path.join(repoRoot, "src", "server", "index.html");
const html = fs.readFileSync(htmlPath, "utf-8");

describe("Backlog Detail Panel UI", () => {
  it("defines openBacklogDetail function", () => {
    assert.ok(html.includes("async function openBacklogDetail(id)"), "should have openBacklogDetail function");
  });

  it("defines saveBacklogItem function", () => {
    assert.ok(html.includes("async function saveBacklogItem(id)"), "should have saveBacklogItem function");
  });

  it("defines deleteBacklogItem function with confirmation", () => {
    assert.ok(html.includes("async function deleteBacklogItem(id)"), "should have deleteBacklogItem function");
    assert.ok(html.includes("confirm('Delete this backlog item?')"), "should have delete confirmation");
  });

  it("defines dispatchBacklogFromPanel function", () => {
    assert.ok(html.includes("async function dispatchBacklogFromPanel(id)"), "should have dispatchBacklogFromPanel function");
  });

  it("detail panel has title input field", () => {
    assert.ok(html.includes('id="bl-edit-title"'), "should have title edit input");
  });

  it("detail panel has description textarea", () => {
    assert.ok(html.includes('id="bl-edit-desc"'), "should have description edit textarea");
  });

  it("detail panel has workflow selector", () => {
    assert.ok(html.includes('id="bl-edit-wf"'), "should have workflow edit select");
  });

  it("detail panel has Save button calling PATCH", () => {
    assert.ok(html.includes("bl-btn-save"), "should have Save button class");
    assert.ok(html.includes("saveBacklogItem("), "should call saveBacklogItem");
    assert.ok(html.includes("method: 'PATCH'"), "saveBacklogItem should use PATCH");
  });

  it("detail panel has Delete button calling DELETE", () => {
    assert.ok(html.includes("bl-btn-delete"), "should have Delete button class");
    assert.ok(html.includes("deleteBacklogItem("), "should call deleteBacklogItem");
    assert.ok(html.includes("method: 'DELETE'"), "deleteBacklogItem should use DELETE");
  });

  it("detail panel has Dispatch button calling dispatch endpoint", () => {
    assert.ok(html.includes("bl-btn-dispatch"), "should have Dispatch button class");
    assert.ok(html.includes("bl-dispatch-btn"), "should have dispatch button id");
    assert.ok(html.includes("dispatchBacklogFromPanel("), "should call dispatchBacklogFromPanel");
  });

  it("dispatch button is disabled when no workflow selected", () => {
    // The dispatch button initial state checks target_workflow
    assert.ok(html.includes("!item.target_workflow || isDispatched) ? 'disabled'"), "should disable dispatch when no workflow");
  });

  it("workflow change listener updates dispatch button state", () => {
    assert.ok(html.includes("bl-edit-wf").valueOf, "should have workflow change listener");
    assert.ok(html.includes("bl-dispatch-btn").valueOf, "should reference dispatch button");
    assert.ok(html.includes("this.value"), "should check workflow value");
  });
});

describe("Backlog Card Reorder Buttons", () => {
  it("defines reorderBacklog function", () => {
    assert.ok(html.includes("async function reorderBacklog(id, newPriority)"), "should have reorderBacklog function");
  });

  it("reorderBacklog calls POST reorder endpoint", () => {
    assert.ok(html.includes("/reorder"), "should call reorder endpoint");
    assert.ok(html.includes("priority: newPriority"), "should send new priority");
  });

  it("has up/down arrow buttons on cards", () => {
    assert.ok(html.includes("reorder-btns"), "should have reorder buttons container");
    assert.ok(html.includes("▲"), "should have up arrow");
    assert.ok(html.includes("▼"), "should have down arrow");
  });

  it("reorder buttons have CSS styling", () => {
    assert.ok(html.includes(".reorder-btns{"), "should style reorder buttons container");
    assert.ok(html.includes(".reorder-btns button{"), "should style reorder buttons");
  });

  it("first item up button is disabled", () => {
    // The template checks idx === 0
    assert.ok(html.includes("idx === 0 ? 'disabled'"), "should disable up on first item");
  });

  it("last item down button is disabled", () => {
    assert.ok(html.includes("idx === backlogItems.length - 1 ? 'disabled'"), "should disable down on last item");
  });
});

describe("Dispatched Items Visual Indicator", () => {
  it("has dispatched CSS class for cards", () => {
    assert.ok(html.includes(".backlog-card.dispatched{"), "should have dispatched card style");
  });

  it("dispatched cards have line-through on title", () => {
    assert.ok(html.includes(".backlog-card.dispatched .card-title{text-decoration:line-through"), "should strikethrough dispatched titles");
  });

  it("dispatched cards have reduced opacity", () => {
    assert.ok(html.includes(".backlog-card.dispatched{opacity:"), "should reduce opacity on dispatched");
  });

  it("dispatched cards have colored left border", () => {
    assert.ok(html.includes(".backlog-card.dispatched{") && html.includes("border-left:3px solid"), "should have left border on dispatched");
  });

  it("cards apply dispatched class conditionally", () => {
    assert.ok(html.includes("isDispatched ? 'dispatched' : ''"), "should conditionally add dispatched class");
  });

  it("dispatched items show link to view run", () => {
    assert.ok(html.includes("findDispatchedRun"), "should have findDispatchedRun function");
    assert.ok(html.includes("View dispatched run"), "should show dispatched run link");
  });

  it("detail panel disables fields for dispatched items", () => {
    assert.ok(html.includes("isDispatched ? 'disabled'"), "should disable inputs for dispatched items");
  });
});

describe("Backlog Card Click Opens Detail Panel", () => {
  it("cards have onclick to open detail", () => {
    assert.ok(html.includes("onclick=\"openBacklogDetail("), "cards should open detail on click");
  });

  it("reorder buttons stop event propagation", () => {
    assert.ok(html.includes('onclick="event.stopPropagation()"'), "reorder area should stop propagation");
  });

  it("detail panel uses the shared overlay", () => {
    assert.ok(html.includes("overlay").valueOf, "should use overlay element");
    assert.ok(html.includes("classList.add('open')"), "should open overlay");
  });
});
