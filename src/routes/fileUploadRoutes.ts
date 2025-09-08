import express from "express";
import {
  imageUpload,
  documentUpload,
  uploadImage,
  deleteImage,
  uploadDocument,
  uploadMultipleDocuments,
  deleteDocument,
} from "../controllers/admin/fileUploadController";
import { requireAuth, requireAdmin } from "../middleware/admin";

const router = express.Router();

// Apply admin authentication middleware to all routes
router.use(requireAuth);
router.use(requireAdmin());

// ===== IMAGE ROUTES =====
// Upload single image
router.post("/image/upload", imageUpload.single("image"), uploadImage);

// Delete image from S3
router.delete("/image/delete", deleteImage);

// ===== DOCUMENT ROUTES =====
// Upload single document
router.post(
  "/document/upload",
  documentUpload.single("document"),
  uploadDocument
);

// Upload multiple documents
router.post(
  "/document/upload-multiple",
  documentUpload.array("documents", 10),
  uploadMultipleDocuments
);

// Delete document
router.delete("/document/:id", deleteDocument);

export default router;
