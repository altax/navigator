import { Router, type IRouter } from "express";
import { exec, spawn } from "node:child_process";
import { logger } from "../lib/logger";
import { WORKSPACE } from "../lib/workspace";
import { invalidateServiceCache } from "../lib/services";

const router: IRouter = Router();

const SERVICES: Record<
  string,
  { killPort: number; runScript: string; cacheKey: "martin" | "graphhopper" | "pelias" | null }
> = {
  martin: {
    killPort:  3000,
    runScript: "stack/martin/run.sh",
    cacheKey:  "martin",
  },
  graphhopper: {
    killPort:  8000,
    runScript: "stack/graphhopper/run.sh",
    cacheKey:  "graphhopper",
  },
};

const restarting: Record<string, boolean> = {};

router.post("/admin/restart/:service", (req, res) => {
  const { service } = req.params;
  const svc = SERVICES[service];

  if (!svc) {
    res.status(404).json({ error: "unknown_service", available: Object.keys(SERVICES) });
    return;
  }

  if (restarting[service]) {
    res.status(409).json({ error: "already_restarting", service });
    return;
  }

  restarting[service] = true;
  logger.info({ service }, "Admin: manual restart requested");

  // Invalidate the cached health status so the next check is live.
  if (svc.cacheKey) invalidateServiceCache(svc.cacheKey);

  // Kill whatever is holding the port, then let the run.sh start fresh.
  exec(`fuser -k ${svc.killPort}/tcp`, () => {
    setTimeout(() => {
      const child = spawn("bash", [svc.runScript], {
        cwd:      WORKSPACE,
        detached: true,
        stdio:    "ignore",
      });
      child.unref();

      logger.info({ service, pid: child.pid }, "Admin: service restarted");

      setTimeout(() => {
        restarting[service] = false;
      }, 15_000);
    }, 2000);
  });

  res.json({ ok: true, service, message: `Restarting ${service}…` });
});

export default router;
