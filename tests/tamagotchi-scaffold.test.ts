import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const TAMA = path.join(ROOT, "tamagotchi");

test("tamagotchi/ directory exists", () => {
  assert.ok(fs.existsSync(TAMA), "tamagotchi/ folder missing");
});

test("project.godot exists with portrait window settings", () => {
  const cfg = fs.readFileSync(path.join(TAMA, "project.godot"), "utf8");
  assert.ok(cfg.includes("viewport_width=720"), "viewport_width missing");
  assert.ok(cfg.includes("viewport_height=1280"), "viewport_height missing");
  assert.ok(cfg.includes('window/handheld/orientation="portrait"'), "portrait orientation missing");
  assert.ok(cfg.includes('window/stretch/mode="canvas_items"'), "stretch mode missing");
});

test("export_presets.cfg contains Android preset", () => {
  const cfg = fs.readFileSync(path.join(TAMA, "export_presets.cfg"), "utf8");
  assert.ok(cfg.includes('platform="Android"'), "Android platform missing");
  assert.ok(cfg.includes('name="Android"'), "Android preset name missing");
});

test("required folder structure exists", () => {
  for (const dir of ["scenes", "scripts", "tests", "assets"]) {
    assert.ok(
      fs.existsSync(path.join(TAMA, dir)),
      `${dir}/ folder missing`
    );
  }
});

test("scenes/main.tscn exists as a Node2D stub", () => {
  const scene = fs.readFileSync(path.join(TAMA, "scenes", "main.tscn"), "utf8");
  assert.ok(scene.includes("Node2D"), "main.tscn should reference Node2D");
});

test("tests/run_tests.gd exists and extends SceneTree", () => {
  const script = fs.readFileSync(path.join(TAMA, "tests", "run_tests.gd"), "utf8");
  assert.ok(script.includes("extends SceneTree"), "run_tests.gd should extend SceneTree");
  assert.ok(script.includes("quit("), "run_tests.gd should call quit()");
});

test("tests/test_smoke.gd has at least one test_ method", () => {
  const smoke = fs.readFileSync(path.join(TAMA, "tests", "test_smoke.gd"), "utf8");
  assert.ok(/^func test_/m.test(smoke), "test_smoke.gd should have a test_ method");
});

test("headless test runner exits 0 (all tests pass)", () => {
  let exitCode: number | null = null;
  try {
    execSync("godot4 --headless --path tamagotchi --script res://tests/run_tests.gd", {
      cwd: ROOT,
      stdio: "pipe",
      timeout: 30000,
    });
    exitCode = 0;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      exitCode = (err as { status: number }).status;
    }
  }
  assert.strictEqual(exitCode, 0, `Godot test runner exited with code ${exitCode}`);
});
