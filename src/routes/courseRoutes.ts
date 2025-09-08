import { Router } from "express";
import {
  createCourse,
  getAllCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
  toggleCoursePublishStatus,
  getCourseStats,
} from "../controllers/admin/courseController";

const router = Router();

// GET /courses/stats - Get course statistics (must be before /:id route)
router.get("/stats", getCourseStats);

// GET /courses - Get all courses with optional filtering
router.get("/", getAllCourses);

// POST /courses - Create a new course
router.post("/", createCourse);

// GET /courses/:id - Get a single course by ID
router.get("/:id", getCourseById);

// PUT /courses/:id - Update a course
router.put("/:id", updateCourse);

// DELETE /courses/:id - Delete a course
router.delete("/:id", deleteCourse);

// PATCH /courses/:id/publish - Toggle course publish status
router.patch("/:id/publish", toggleCoursePublishStatus);

export default router;
