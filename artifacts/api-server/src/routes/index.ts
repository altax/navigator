import { Router, type IRouter } from "express";
import healthRouter from "./health";
import poisRouter from "./pois";
import courierRoutesRouter from "./courierRoutes";
import geoRouter from "./geo";
import stackRouter from "./stack";
import progressRouter from "./progress";
import tilesRouter from "./tiles";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(poisRouter);
router.use(courierRoutesRouter);
router.use(geoRouter);
router.use(stackRouter);
router.use(progressRouter);
router.use(tilesRouter);
router.use(adminRouter);

export default router;
