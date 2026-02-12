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

  const srcHtml = readUtf8(srcHtmlPath);
  const distHtml = readUtf8(distHtmlPath);

  for (const [label, html] of [["src", srcHtml], ["dist", distHtml]] as const) {
    assert(html.includes("function featureStructureVisualState(building)"), `${label}: visual state helper missing`);
    assert(html.includes("function featureStructureClassName(building)"), `${label}: visual class helper missing`);

    assert(html.includes("if (!building.committed || !building.runId) return 'draft';"), `${label}: draft state mapping missing`);
    assert(html.includes("if (SUCCESS_RUN_STATUSES.has(status)) return 'done';"), `${label}: done mapping missing`);
    assert(html.includes("if (FAILED_RUN_STATUSES.has(status)) return 'failed';"), `${label}: failed mapping missing`);
    assert(html.includes("if (!status || NON_TERMINAL_RUN_STATUSES.has(status)) return 'in-progress';"), `${label}: in-progress mapping missing`);

    assert(html.includes("if (visualState === 'draft' || visualState === 'in-progress') return 'is-half-transparent';"), `${label}: half-transparency class mapping missing`);
    assert(html.includes("if (visualState === 'failed') return 'is-failed';"), `${label}: failed class mapping missing`);

    assert(html.includes("const featureVisualClass = b.kind === 'feature' ? featureStructureClassName(b) : '';"), `${label}: renderWorld does not use helper for class selection`);
    assert(html.includes(".is-half-transparent { opacity:.5; }"), `${label}: half transparency css class missing`);
  }

  console.log("PASS: Feature visual state mapping centralizes draft/in-progress transparency and run terminal states.");
}

run();
