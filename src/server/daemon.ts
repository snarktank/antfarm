#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { startDashboard } from "./dashboard.js";
import { resolveAntfarmDashboardPidPath } from "../installer/paths.js";

const port = parseInt(process.argv[2], 10) || 3333;

const pidFile = resolveAntfarmDashboardPidPath();
const pidDir = path.dirname(pidFile);

fs.mkdirSync(pidDir, { recursive: true });
fs.writeFileSync(pidFile, String(process.pid));

process.on("SIGTERM", () => {
  try { fs.unlinkSync(pidFile); } catch {}
  process.exit(0);
});

startDashboard(port);
