#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { startDashboard } from "./dashboard.js";
import { ensureDashboardServe } from "./tailscale-serve.js";

const port = parseInt(process.argv[2], 10) || 3333;
const SERVE_RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

const pidDir = path.join(os.homedir(), ".openclaw", "antfarm");
const pidFile = path.join(pidDir, "dashboard.pid");

fs.mkdirSync(pidDir, { recursive: true });
fs.writeFileSync(pidFile, String(process.pid));

process.on("SIGTERM", () => {
  try { fs.unlinkSync(pidFile); } catch {}
  process.exit(0);
});

startDashboard(port);

void ensureDashboardServe(port).catch((error) => {
  console.error(`[antfarm] Failed to attach Tailscale serve for dashboard: ${error instanceof Error ? error.message : String(error)}`);
});

const serveInterval = setInterval(() => {
  void ensureDashboardServe(port).catch((error) => {
    console.error(`[antfarm] Failed to reconcile Tailscale serve for dashboard: ${error instanceof Error ? error.message : String(error)}`);
  });
}, SERVE_RECONCILE_INTERVAL_MS);

process.on("SIGTERM", () => {
  clearInterval(serveInterval);
});
