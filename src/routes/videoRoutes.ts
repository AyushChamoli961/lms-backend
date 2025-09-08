import { Router } from "express";
import {
  uploadVideoToChapter,
  handleMuxWebhook,
  getVideoStatus,
  deleteVideo,
  upload,
} from "../controllers/admin/videoController";
import { requireAuth } from "../middleware/admin";

const router = Router();

// POST /videos/upload/:chapterId - Upload video to a chapter
router.post(
  "/upload/:chapterId",
  requireAuth,
  upload.single("video"),
  uploadVideoToChapter
);

// GET /videos/status/:chapterId - Get video processing status for a chapter
router.get("/status/:chapterId", requireAuth, getVideoStatus);

// DELETE /videos/:chapterId - Delete video from a chapter
router.delete("/:chapterId", requireAuth, deleteVideo);

// POST /videos/webhooks/mux - Handle Mux webhooks (should be called by Mux)
router.post("/webhooks/mux", handleMuxWebhook);

export default router;
