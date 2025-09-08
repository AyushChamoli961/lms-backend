import express from "express";
import {
  getUserProfile,
  updateUserProfile,
  getUserStatistics,
} from "../controllers/user/profileController";
import { requireAuth } from "../middleware/admin";

const router = express.Router();

// Apply authentication middleware to all profile routes
router.use(requireAuth);

// Get user profile
router.get("/", getUserProfile);

// Update user profile
router.put("/", updateUserProfile);

// Get user statistics
router.get("/statistics", getUserStatistics);

export default router;
