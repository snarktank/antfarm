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
    assert(!html.includes("id=\"assignmentRows\""), `${label}: editable assignment rows still rendered`);
    assert(!html.includes("id=\"autoAssignBtn\""), `${label}: auto-assign button still rendered`);

    assert(html.includes("function deriveLaunchAssignments(slots, draft, agentPool)"), `${label}: launch assignment derivation helper missing`);
    assert(html.includes("agentId: String(draft.assignments?.[i] || slot.defaultAgent || agentPool[i % agentPool.length] || `feature-dev/${slot.id}`)"), `${label}: launch assignment fallback chain missing`);
    assert(html.includes("const assignments = deriveLaunchAssignments(slots, draft, agentOptions);"), `${label}: launch does not use automatic assignment derivation helper`);

    assert(html.includes("renderAgentStatusList(deriveAssignedAgents(slots, draft, run), run)"), `${label}: post-launch assigned-agent status list missing`);
  }

  console.log("PASS: Assignment editing UI removed while automatic launch assignments and read-only assigned-agent visibility remain.");
}

run();
