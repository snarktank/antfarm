import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getDb } from "../db.js";
import { sendSessionMessage } from "./gateway-api.js";
const EVENTS_DIR = path.join(os.homedir(), ".openclaw", "antfarm");
const EVENTS_FILE = path.join(EVENTS_DIR, "events.jsonl");
const MAX_EVENTS_SIZE = 10 * 1024 * 1024; // 10MB
export function emitEvent(evt) {
    try {
        fs.mkdirSync(EVENTS_DIR, { recursive: true });
        // Rotate if too large
        try {
            const stats = fs.statSync(EVENTS_FILE);
            if (stats.size > MAX_EVENTS_SIZE) {
                const rotated = EVENTS_FILE + ".1";
                try {
                    fs.unlinkSync(rotated);
                }
                catch { }
                fs.renameSync(EVENTS_FILE, rotated);
            }
        }
        catch { }
        fs.appendFileSync(EVENTS_FILE, JSON.stringify(evt) + "\n");
    }
    catch {
        // best-effort, never throw
    }
    fireWebhook(evt);
}
// In-memory cache: runId -> notify_url | null
const notifyUrlCache = new Map();
function getNotifyUrl(runId) {
    if (notifyUrlCache.has(runId))
        return notifyUrlCache.get(runId);
    try {
        const db = getDb();
        const row = db.prepare("SELECT notify_url FROM runs WHERE id = ?").get(runId);
        const url = row?.notify_url ?? null;
        notifyUrlCache.set(runId, url);
        return url;
    }
    catch {
        return null;
    }
}
function fireWebhook(evt) {
    const raw = getNotifyUrl(evt.runId);
    if (!raw)
        return;
    if (raw.startsWith("session://")) {
        const sessionKey = raw.slice("session://".length);
        if (!sessionKey)
            return;
        if (evt.event !== "run.completed" && evt.event !== "run.failed")
            return;
        const workflow = evt.workflowId ?? "workflow";
        const shortRun = evt.runId.slice(0, 8);
        const message = evt.event === "run.completed"
            ? `Antfarm ${workflow} run ${shortRun} completed.`
            : `Antfarm ${workflow} run ${shortRun} failed${evt.detail ? `: ${evt.detail}` : "."}`;
        void sendSessionMessage({ sessionKey, message }).catch(() => { });
        return;
    }
    try {
        let url = raw;
        const headers = { "Content-Type": "application/json" };
        const hashIdx = url.indexOf("#auth=");
        if (hashIdx !== -1) {
            headers["Authorization"] = decodeURIComponent(url.slice(hashIdx + 6));
            url = url.slice(0, hashIdx);
        }
        fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(evt),
            signal: AbortSignal.timeout(5000),
        }).catch(() => { });
    }
    catch {
        // fire-and-forget
    }
}
// Read recent events (last N)
export function getRecentEvents(limit = 50) {
    try {
        const content = fs.readFileSync(EVENTS_FILE, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);
        const events = [];
        for (const line of lines) {
            try {
                events.push(JSON.parse(line));
            }
            catch { }
        }
        return events.slice(-limit);
    }
    catch {
        return [];
    }
}
// Read events for a specific run (supports prefix match)
export function getRunEvents(runId, limit = 200) {
    try {
        const content = fs.readFileSync(EVENTS_FILE, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);
        const events = [];
        for (const line of lines) {
            try {
                const evt = JSON.parse(line);
                if (evt.runId === runId || evt.runId.startsWith(runId))
                    events.push(evt);
            }
            catch { }
        }
        return events.slice(-limit);
    }
    catch {
        return [];
    }
}
