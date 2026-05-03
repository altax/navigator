import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
