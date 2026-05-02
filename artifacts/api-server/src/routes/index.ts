import { Router, type IRouter } from "express";
import healthRouter from "./health";
import poisRouter from "./pois";
import courierRoutesRouter from "./courierRoutes";
import geoRouter from "./geo";
import stackRouter from "./stack";
import tilesRouter from "./tiles";

const router: IRouter = Router();

router.use(healthRouter);
router.use(poisRouter);
router.use(courierRoutesRouter);
router.use(geoRouter);
router.use(stackRouter);
router.use(tilesRouter);

export default router;
