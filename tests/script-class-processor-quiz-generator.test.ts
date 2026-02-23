/**
 * Tests for script-class-processor quiz-generator agent (SCP-007)
 * Validates quiz-generator agent definition files and structure.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_DIR = path.resolve(__dirname, "..", "workflows", "script-class-processor");
const QUIZ_GENERATOR_DIR = path.join(WORKFLOW_DIR, "agents", "quiz-generator");
const AGENTS_MD = path.join(QUIZ_GENERATOR_DIR, "AGENTS.md");
const SOUL_MD = path.join(QUIZ_GENERATOR_DIR, "SOUL.md");
const IDENTITY_MD = path.join(QUIZ_GENERATOR_DIR, "IDENTITY.md");

describe("quiz-generator agent (SCP-007)", () => {
  it("has quiz-generator agent directory", () => {
    const stats = fs.statSync(QUIZ_GENERATOR_DIR);
    assert.ok(stats.isDirectory(), "quiz-generator agent directory should exist");
  });

  it("has AGENTS.md with quiz generation instructions", () => {
    const stats = fs.statSync(AGENTS_MD);
    assert.ok(stats.isFile(), "AGENTS.md should exist");
    
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    assert.ok(content.includes("quiz"), "should mention quiz");
    assert.ok(content.includes("notes"), "should mention notes");
    assert.ok(content.includes("questions"), "should mention questions");
  });

  it("has SOUL.md with agent persona", () => {
    const stats = fs.statSync(SOUL_MD);
    assert.ok(stats.isFile(), "SOUL.md should exist");
    
    const content = fs.readFileSync(SOUL_MD, "utf-8");
    assert.ok(content.includes("Who You Are"), "should have 'Who You Are' section");
    assert.ok(content.includes("Core Truths"), "should have 'Core Truths' section");
  });

  it("has IDENTITY.md with correct identity", () => {
    const stats = fs.statSync(IDENTITY_MD);
    assert.ok(stats.isFile(), "IDENTITY.md should exist");
    
    const content = fs.readFileSync(IDENTITY_MD, "utf-8");
    assert.ok(content.includes("Name: Quiz Generator"), "should have Name: Quiz Generator");
    assert.ok(content.includes("Role: Assessment"), "should have Role: Assessment");
  });

  it("AGENTS.md defines notes.md input", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for notes input
    assert.ok(
      content.includes("notes.md"),
      "should define notes.md as input"
    );
    assert.ok(
      content.includes("transcripts/notes/"),
      "should reference transcripts/notes/ directory"
    );
  });

  it("AGENTS.md defines Quick Check question type", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("Quick Check"), "should have Quick Check section");
    assert.ok(content.includes("5"), "should specify 5 quick check questions");
    assert.ok(content.includes("recall"), "should mention recall for quick check");
  });

  it("AGENTS.md defines Concept Check question type", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("Concept Check"), "should have Concept Check section");
    assert.ok(content.includes("understanding"), "should mention understanding");
  });

  it("AGENTS.md defines Scenario Practice question type", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("Scenario Practice"), "should have Scenario Practice section");
    assert.ok(content.includes("real-world") || content.includes("scenario"), "should mention real-world scenarios");
    assert.ok(content.includes("3"), "should specify 3 scenarios");
  });

  it("AGENTS.md defines Flashcards question type", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("Flashcards") || content.includes("Flashcard"), "should have Flashcards section");
    assert.ok(content.includes("10"), "should specify 10 flashcards");
  });

  it("AGENTS.md defines quiz.md output", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for output file
    assert.ok(
      content.includes("quiz.md"),
      "should mention quiz.md output"
    );
    assert.ok(
      content.includes("transcripts/quizzes/"),
      "should define transcripts/quizzes/ output directory"
    );
  });

  it("AGENTS.md defines answer key section", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("Answer Key"), "should have Answer Key section");
  });

  it("AGENTS.md defines proper output format", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("STATUS:"), "should define STATUS output");
    assert.ok(content.includes("SESSION_ID:"), "should define SESSION_ID output");
    assert.ok(content.includes("OUTPUT_FILE:"), "should define OUTPUT_FILE output");
    assert.ok(content.includes("QUICK_CHECK_COUNT:"), "should define QUICK_CHECK_COUNT output");
    assert.ok(content.includes("CONCEPT_CHECK_COUNT:"), "should define CONCEPT_CHECK_COUNT output");
    assert.ok(content.includes("SCENARIO_COUNT:"), "should define SCENARIO_COUNT output");
    assert.ok(content.includes("FLASHCARD_COUNT:"), "should define FLASHCARD_COUNT output");
  });

  it("AGENTS.md includes error handling instructions", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("Error Handling"), "should have error handling section");
    assert.ok(content.includes("STATUS: error"), "should define error status format");
  });

  it("AGENTS.md includes question writing guidelines", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("Question"), "should mention question guidelines");
    assert.ok(content.includes("Answer"), "should mention answer format");
  });
});
