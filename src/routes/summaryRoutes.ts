import { Router } from "express";
import {
  createSummary,
  getAllSummaries,
  getSummaryById,
  getSummaryByChapterId,
  updateSummary,
  deleteSummary,
  getSummariesByCourse,
  bulkCreateSummaries,
} from "../controllers/admin/summaryController";

const router = Router();

// Create a new summary
router.post("/", createSummary);

// Get all summaries with pagination
router.get("/", getAllSummaries);

// Get summary by ID
router.get("/:id", getSummaryById);

// Get summary by chapter ID
router.get("/chapter/:chapterId", getSummaryByChapterId);

// Get summaries by course ID
router.get("/course/:courseId", getSummariesByCourse);

// Update summary
router.put("/:id", updateSummary);

// Delete summary
router.delete("/:id", deleteSummary);

// Bulk create summaries
router.post("/bulk", bulkCreateSummaries);

export default router;
