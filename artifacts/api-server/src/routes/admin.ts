import { Router, type IRouter, type RequestHandler } from "express";
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

// ── Optional secret-based auth ──────────────────────────────────────────────
// If ADMIN_SECRET env var is set, the request must include
// Authorization: Bearer <secret>. If not set, the endpoint is unrestricted
// (acceptable for a personal self-hosted tool on a trusted network).
const adminAuth: RequestHandler = (req, res, next) => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    next();
    return;
  }
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token !== secret) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
};

router.post("/admin/restart/:service", adminAuth, (req, res) => {
  // Coerce to string — Express 5 params can be string | string[] for regex routes.
  const service = String(req.params["service"] ?? "");
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
