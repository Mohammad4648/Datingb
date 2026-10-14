import { Router, type IRouter } from "express";
import healthRouter from "./health";
import conversationsRouter from "./conversations";
import profilesRouter from "./profiles";
import roomsRouter from "./rooms";
import socialPostsRouter from "./socialPosts";
import storageRouter from "./storage";
import translationsRouter from "./translations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profilesRouter);
router.use(conversationsRouter);
router.use(roomsRouter);
router.use(socialPostsRouter);
router.use(storageRouter);
router.use(translationsRouter);

export default router;
