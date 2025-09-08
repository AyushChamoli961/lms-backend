import express from "express";
import { requireAuth } from "../middleware/admin";
import {
  getCourses,
  getCourseById,
  getFeaturedCourses,
  searchCourses,
  getCoursesByCategory,
} from "../controllers/user/courseController";
import {
  getUserEnrolledCourses,
  markChapterAsWatched,
  getUserCourseProgress,
  getRecentlyWatchedCourses,
  bookmarkCourse,
  unbookmarkCourse,
  enrollInCourse,
  unenrollFromCourse,
  updateVideoProgress,
  getChapterDetails,
} from "../controllers/user/userProgressController";

const router = express.Router();

// Course Discovery & Browsing Routes (public)
router.get("/courses", getCourses);
router.get("/courses/featured", getFeaturedCourses);
router.get("/courses/search", searchCourses);
router.get("/courses/category/:category", getCoursesByCategory);
router.get("/courses/:courseId", requireAuth, getCourseById);

// User Progress & Enrollment Routes (require authentication)
router.get("/enrolled-courses", requireAuth, getUserEnrolledCourses);
router.get("/courses/:courseId/progress", requireAuth, getUserCourseProgress);
router.get("/recently-watched", requireAuth, getRecentlyWatchedCourses);

// Course Enrollment Routes (require authentication)
router.post("/courses/:courseId/enroll", requireAuth, enrollInCourse);
router.delete("/courses/:courseId/enroll", requireAuth, unenrollFromCourse);

// Chapter Progress Routes (require authentication)
router.post("/chapters/:chapterId/watch", requireAuth, markChapterAsWatched);

// Video Progress Routes (require authentication)
router.put("/chapters/:chapterId/progress", requireAuth, updateVideoProgress);
// router.get("/chapters/:chapterId/progress", requireAuth, getVideoProgress);

// Chapter Details Route (require authentication)
router.get("/chapters/:chapterId", requireAuth, getChapterDetails);

// Bookmark Routes (require authentication)
router.post("/courses/:courseId/bookmark", requireAuth, bookmarkCourse);
router.delete("/courses/:courseId/bookmark", requireAuth, unbookmarkCourse);

export default router;
