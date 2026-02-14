import { startDashboard } from "./dashboard.js";
import http from "node:http";

async function fetch(url: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: data }));
    }).on("error", reject);
  });
}

async function main() {
  const port = 39123;
  const server = startDashboard(port);

  // Wait for listen
  await new Promise<void>((r) => setTimeout(r, 500));

  try {
    const res = await fetch(`http://localhost:${port}/api/ping`);
    console.assert(res.status === 200, `Expected 200, got ${res.status}`);
    console.assert(res.headers["content-type"] === "application/json", `Bad content-type: ${res.headers["content-type"]}`);
    const body = JSON.parse(res.body);
    console.assert(body.pong === true, `Expected {pong:true}, got ${JSON.stringify(body)}`);
    console.log("✅ All /api/ping tests passed");
  } finally {
    server.close();
  }
}

main().catch((e) => { console.error("❌ Test failed:", e); process.exit(1); });
