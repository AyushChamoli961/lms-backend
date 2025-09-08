import { Router } from "express";
import {
  createChapter,
  getChaptersByCourse,
  getChapterById,
  updateChapter,
  deleteChapter,
  toggleChapterPublishStatus,
  reorderChapters,
  getChapterStats,
} from "../controllers/admin/chapterController";

const router = Router();

// GET /chapters/course/:courseId - Get all chapters for a course
router.get("/course/:courseId", getChaptersByCourse);

// POST /chapters - Create a new chapter
router.post("/", createChapter);

// GET /chapters/:id - Get a single chapter by ID
router.get("/:id", getChapterById);

// GET /chapters/:id/stats - Get chapter statistics
router.get("/:id/stats", getChapterStats);

// PUT /chapters/:id - Update a chapter
router.put("/:id", updateChapter);

// DELETE /chapters/:id - Delete a chapter
router.delete("/:id", deleteChapter);

// PATCH /chapters/:id/publish - Toggle chapter publish status
router.patch("/:id/publish", toggleChapterPublishStatus);

// PATCH /chapters/course/:courseId/reorder - Reorder chapters within a course
router.patch("/course/:courseId/reorder", reorderChapters);

export default router;
