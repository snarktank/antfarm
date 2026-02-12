import fs from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readUtf8(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function run(): void {
  const repoRoot = process.cwd();
  const srcHtmlPath = path.join(repoRoot, "src/server/rts.html");
  const distHtmlPath = path.join(repoRoot, "dist/server/rts.html");
  const srcSpriteDir = path.join(repoRoot, "src/server/rts-sprites");
  const distSpriteDir = path.join(repoRoot, "dist/server/rts-sprites");

  const srcHtml = readUtf8(srcHtmlPath);
  const distHtml = readUtf8(distHtmlPath);

  for (const [label, html] of [["src", srcHtml], ["dist", distHtml]] as const) {
    assert(html.includes('id="cancelPlacementBtn"'), `${label}: cancelPlacementBtn missing`);
    assert(html.includes('id="deleteSelectedBtn"'), `${label}: deleteSelectedBtn missing`);

    assert(html.includes('/rts-sprites/cancel-button.svg'), `${label}: cancel sprite reference missing`);
    assert(html.includes('/rts-sprites/delete-button.svg'), `${label}: delete sprite reference missing`);

    assert(html.includes('title="Cancel placement (Esc)"'), `${label}: cancel title missing Esc hint`);
    assert(html.includes('aria-label="Cancel placement (Escape)"'), `${label}: cancel aria label missing Escape hint`);

    assert(html.includes('title="Delete selected (Delete)"'), `${label}: delete title missing Delete hint`);
    assert(html.includes('aria-label="Delete selected (Delete)"'), `${label}: delete aria label missing Delete hint`);
  }

  assert(fs.existsSync(path.join(srcSpriteDir, "cancel-button.svg")), "src cancel sprite missing");
  assert(fs.existsSync(path.join(srcSpriteDir, "delete-button.svg")), "src delete sprite missing");
  assert(fs.existsSync(path.join(distSpriteDir, "cancel-button.svg")), "dist cancel sprite missing");
  assert(fs.existsSync(path.join(distSpriteDir, "delete-button.svg")), "dist delete sprite missing");

  console.log("PASS: RTS command controls use sprite buttons with accessibility hints.");
}

run();
