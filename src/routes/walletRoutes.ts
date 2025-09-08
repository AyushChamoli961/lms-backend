import express from "express";
import {
  getUserWallet,
  getWalletStatistics,
} from "../controllers/user/walletController";
import { requireAuth } from "../middleware/admin";

const router = express.Router();

// Apply authentication middleware to all wallet routes
router.use(requireAuth);

// Get user wallet with paginated transactions
router.get("/", getUserWallet);

// Get wallet statistics
router.get("/statistics", getWalletStatistics);

export default router;
