import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

describe("dashboard SSE", () => {
  let tmpDir = "";
  let eventsFile = "";
  let server: http.Server | null = null;
  let port = 0;
  const prevEventsFile = process.env.ANTFARM_EVENTS_FILE;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-dashboard-sse-"));
    eventsFile = path.join(tmpDir, "events.jsonl");
    process.env.ANTFARM_EVENTS_FILE = eventsFile;
    await fs.writeFile(eventsFile, "", "utf-8");

    const { startDashboard } = await import("../dist/server/dashboard.js");
    server = startDashboard(0);
    await once(server, "listening");
    const addr = server.address();
    assert.ok(addr && typeof addr !== "string");
    port = addr.port;
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
    if (prevEventsFile === undefined) delete process.env.ANTFARM_EVENTS_FILE;
    else process.env.ANTFARM_EVENTS_FILE = prevEventsFile;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("pushes newly emitted events over /api/events/stream", async () => {
    const runId = `sse-run-${Date.now()}`;
    const expected = {
      ts: new Date().toISOString(),
      event: "step.done",
      runId,
      workflowId: "wf-live",
      stepId: "implement",
      agentId: "wf-live_dev",
    };

    const seen = await new Promise<any>((resolve, reject) => {
      const req = http.request({
        host: "127.0.0.1",
        port,
        path: "/api/events/stream",
        method: "GET",
        headers: { Accept: "text/event-stream" },
      });

      const fail = (err: unknown) => reject(err instanceof Error ? err : new Error(String(err)));
      req.on("error", fail);

      req.on("response", (res) => {
        res.setEncoding("utf-8");
        let buffer = "";
        let appended = false;
        const timeout = setTimeout(() => {
          req.destroy();
          res.destroy();
          reject(new Error("timed out waiting for SSE event"));
        }, 7000);

        res.on("data", (chunk: string) => {
          buffer += chunk;
          if (!appended && buffer.includes("retry:")) {
            appended = true;
            void fs.appendFile(eventsFile, `${JSON.stringify(expected)}\n`, "utf-8").catch(fail);
          }

          let idx = buffer.indexOf("\n\n");
          while (idx >= 0) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            idx = buffer.indexOf("\n\n");

            const dataLine = block
              .split("\n")
              .find((line) => line.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const payload = JSON.parse(dataLine.slice(6));
              if (payload.runId === runId) {
                clearTimeout(timeout);
                req.destroy();
                res.destroy();
                resolve(payload);
                return;
              }
            } catch {
              // ignore malformed payloads
            }
          }
        });
      });

      req.end();
    });

    assert.equal(seen.runId, runId);
    assert.equal(seen.event, "step.done");
    assert.equal(seen.stepId, "implement");
  });
});
