import { Router } from "express";
import { userController } from "../controllers/admin/userController";

const router = Router();

// Mount user controller
router.use("/", userController);

export { router as adminRoutes };
