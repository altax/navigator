import { Router, type IRouter } from "express";
import { MARTIN_URL } from "../lib/services";

const router: IRouter = Router();

router.get(/^\/tiles(?:\/(.*))?$/, async (req, res) => {
  let subPath = req.path.replace(/^\/tiles\/?/, "");
  if (subPath.startsWith("font/") && subPath.endsWith(".pbf")) {
    subPath = subPath.slice(0, -4);
  }
  const target = `${MARTIN_URL}/${subPath}`;
  try {
    const upstream = await fetch(target, {
      headers: { accept: req.headers.accept ?? "*/*" },
    });
    res.status(upstream.status);
    const ct = upstream.headers.get("content-type") ?? "";
    if (ct) res.setHeader("content-type", ct);
    if (upstream.ok) {
      res.setHeader("cache-control", "public, max-age=3600");
    } else {
      res.setHeader("cache-control", "no-store");
    }
    if (ct.includes("application/json")) {
      const text = await upstream.text();
      const rewritten = text
        .replaceAll(MARTIN_URL, "/api/tiles")
        .replace(/https?:\/\/localhost:3000/g, "/api/tiles")
        .replace(/https?:\/\/127\.0\.0\.1:3000/g, "/api/tiles");
      res.send(rewritten);
    } else {
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    }
  } catch (e) {
    req.log.error({ err: e, target }, "tile proxy failed");
    res.status(502).json({ error: "tile_upstream_unreachable" });
  }
});

export default router;
