import { Router, type IRouter } from "express";
import healthRouter from "./health";
import conversationsRouter from "./conversations";
import profilesRouter from "./profiles";
import roomsRouter from "./rooms";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profilesRouter);
router.use(conversationsRouter);
router.use(roomsRouter);

export default router;
