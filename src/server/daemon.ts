#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { startDashboard } from "./dashboard.js";
import { getEventLoopMonitor } from "../monitoring/event-loop-lag.js";

const port = parseInt(process.argv[2], 10) || 3333;

const pidDir = path.join(os.homedir(), ".openclaw", "antfarm");
const pidFile = path.join(pidDir, "dashboard.pid");

fs.mkdirSync(pidDir, { recursive: true });
fs.writeFileSync(pidFile, String(process.pid));

// Start event loop lag monitoring
const monitor = getEventLoopMonitor();
monitor.start();

process.on("SIGTERM", () => {
  monitor.stop();
  try { fs.unlinkSync(pidFile); } catch {}
  process.exit(0);
});

startDashboard(port);
