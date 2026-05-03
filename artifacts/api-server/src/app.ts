import express, { type Express, type ErrorRequestHandler, type RequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// ── Security headers ────────────────────────────────────────────────────────
// Applied before all routes. Minimal set that is safe for a JSON API server.
// No X-Frame-Options (this API is not a page), no full CSP (not serving HTML).
const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  next();
};

app.use(securityHeaders);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());

// Explicit body size limit — prevents accidental or malicious oversized payloads.
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: true, limit: "512kb" }));

app.use("/api", router);

// ── Global error handler ────────────────────────────────────────────────────
// Must be registered AFTER all routes. Express 5 propagates async errors
// automatically; without this handler they would surface as an HTML response.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const anyErr = err as Record<string, unknown>;
  const status =
    typeof anyErr.status === "number"
      ? anyErr.status
      : typeof anyErr.statusCode === "number"
        ? anyErr.statusCode
        : 500;
  const message =
    typeof anyErr.message === "string" ? anyErr.message : "Internal server error";

  logger.error({ err }, "Unhandled error");

  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
};

app.use(errorHandler);

export default app;
