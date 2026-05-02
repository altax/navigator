/**
 * Service watchdog — periodically checks Martin and GraphHopper health.
 * If a service is down for FAIL_THRESHOLD consecutive checks, it is restarted
 * by killing any stuck process and re-spawning the run.sh script.
 *
 * This runs entirely inside the API Server process — no extra workflow needed.
 */
import { exec, spawn } from "node:child_process";
import { logger } from "./logger";

const CHECK_INTERVAL_MS = 60_000;   // check every 60 s
const FAIL_THRESHOLD    = 3;         // restart after 3 consecutive failures (~3 min)
const WORKSPACE         = "/home/runner/workspace";

interface ServiceConfig {
  name:       string;
  healthUrl:  string;
  killPattern: string;      // pattern passed to pkill -f
  runScript:  string;       // relative to WORKSPACE
}

const SERVICES: ServiceConfig[] = [
  {
    name:        "Martin",
    healthUrl:   "http://127.0.0.1:3000/health",
    killPattern: "martin",
    runScript:   "stack/martin/run.sh",
  },
  {
    name:        "GraphHopper",
    healthUrl:   "http://127.0.0.1:8000/health",
    killPattern: "graphhopper-web",
    runScript:   "stack/graphhopper/run.sh",
  },
];

const failCounts: Record<string, number> = {};
const restarting: Record<string, boolean> = {};

async function isUp(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

function restartService(svc: ServiceConfig): void {
  if (restarting[svc.name]) return;
  restarting[svc.name] = true;

  logger.warn({ service: svc.name }, "Watchdog: restarting service");

  // Kill any stuck process first (ignore errors if already dead)
  exec(`pkill -f "${svc.killPattern}"`, () => {
    // Wait a moment for the port to release
    setTimeout(() => {
      const child = spawn("bash", [svc.runScript], {
        cwd:      WORKSPACE,
        detached: true,
        stdio:    "ignore",
      });
      child.unref();

      logger.info({ service: svc.name, pid: child.pid }, "Watchdog: service restarted");
      failCounts[svc.name] = 0;
      restarting[svc.name] = false;
    }, 3000);
  });
}

async function checkAll(): Promise<void> {
  for (const svc of SERVICES) {
    const up = await isUp(svc.healthUrl);
    if (up) {
      if (failCounts[svc.name]) {
        logger.info({ service: svc.name }, "Watchdog: service recovered");
      }
      failCounts[svc.name] = 0;
    } else {
      failCounts[svc.name] = (failCounts[svc.name] ?? 0) + 1;
      const count = failCounts[svc.name];
      logger.warn({ service: svc.name, failCount: count }, "Watchdog: service unreachable");

      if (count >= FAIL_THRESHOLD && !restarting[svc.name]) {
        restartService(svc);
      }
    }
  }
}

export function startWatchdog(): void {
  // Initial check after 2 minutes to let services warm up first
  setTimeout(() => {
    checkAll().catch(() => {});
    setInterval(() => checkAll().catch(() => {}), CHECK_INTERVAL_MS);
  }, 120_000);

  logger.info("Watchdog started (checks Martin & GraphHopper every 60s, restarts after 3 failures)");
}
