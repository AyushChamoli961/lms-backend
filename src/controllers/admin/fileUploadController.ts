import { Request, Response } from "express";
import multer from "multer";
import prisma from "../../lib/db";
import path from "path";
import fs from "fs";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

// S3 Configuration
const region = process.env.AWS_REGION!;
const bucket = process.env.AWS_S3_UPLOAD_BUCKET!;
const cloudfrontDomain = "https://dm9e1ck5gd5sb.cloudfront.net/";

export const s3 = new S3Client({ region });

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/images";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

// Image file filter
const imageFileFilter = (req: any, file: any, cb: any) => {
  const allowedImageTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
  ];

  if (allowedImageTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only images are allowed!"), false);
  }
};

// Document file filter
const documentFileFilter = (req: any, file: any, cb: any) => {
  const allowedDocumentTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
  ];

  if (allowedDocumentTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only documents are allowed!"), false);
  }
};

// Multer configurations
export const imageUpload = multer({
  storage: storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for images
  },
});

export const documentUpload = multer({
  storage: storage,
  fileFilter: documentFileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for documents
  },
});

// ===== IMAGE UPLOAD FUNCTIONALITY =====

// Upload single image
export const uploadImage = async (req: Request, res: Response) => {
  try {
    const file = req.file;

    if (!file) {
      return res
        .status(400)
        .json({ success: false, message: "No image uploaded" });
    }

    // Upload to S3
    let s3Result;
    try {
      s3Result = await uploadLocalFileToS3(
        file.path,
        file.originalname,
        "images"
      );
    } catch (s3Err) {
      console.error("S3 upload error:", s3Err);
      fs.existsSync(file.path) && fs.unlink(file.path, () => {});
      return res
        .status(500)
        .json({ success: false, message: "Failed to upload to storage" });
    }

    // Clean up local file
    fs.existsSync(file.path) && fs.unlink(file.path, () => {});

    // Create CloudFront URL
    const cloudfrontUrl = cloudfrontDomain + s3Result.key.split("/")[1];

    res.status(201).json({
      success: true,
      message: "Image uploaded successfully",
      data: {
        originalName: file.originalname,
        fileName: path.basename(file.filename),
        size: file.size,
        mimeType: file.mimetype,
        s3Key: s3Result.key,
        imageUrl: cloudfrontUrl,
      },
    });
  } catch (error) {
    console.error("Image upload error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// Delete image from S3
export const deleteImage = async (req: Request, res: Response) => {
  try {
    const { s3Key } = req.body;

    if (!s3Key) {
      return res.status(400).json({
        success: false,
        message: "S3 key is required",
      });
    }

    // Delete from S3
    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: s3Key,
        })
      );
    } catch (s3Error) {
      console.error("Error deleting from S3:", s3Error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete image from storage",
      });
    }

    res.status(200).json({
      success: true,
      message: "Image deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting image:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// ===== DOCUMENT UPLOAD FUNCTIONALITY =====

// Upload single document
export const uploadDocument = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { chapterId } = req.body;

    if (!file) {
      return res
        .status(400)
        .json({ success: false, message: "No document uploaded" });
    }

    if (!chapterId) {
      return res
        .status(400)
        .json({ success: false, message: "Chapter ID is required" });
    }

    // Validate chapter exists
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      include: { course: { select: { id: true, title: true } } },
    });

    if (!chapter) {
      // cleanup local file
      fs.existsSync(file.path) && fs.unlink(file.path, () => {});
      return res
        .status(404)
        .json({ success: false, message: "Chapter not found" });
    }

    // Upload to S3
    let s3Result;
    try {
      s3Result = await uploadLocalFileToS3(
        file.path,
        file.originalname,
        "images"
      );
    } catch (s3Err) {
      console.error("S3 upload error:", s3Err);
      fs.existsSync(file.path) && fs.unlink(file.path, () => {});
      return res
        .status(500)
        .json({ success: false, message: "Failed to upload to storage" });
    }

    // Clean up local file
    fs.existsSync(file.path) && fs.unlink(file.path, () => {});

    // Create CloudFront URL
    const cloudfrontUrl = cloudfrontDomain + s3Result.key.split("/")[1];

    // Save document record to database
    const documentRecord = await prisma.document.create({
      data: {
        title: file.originalname,
        fileUrl: cloudfrontUrl,
        fileType: getFileType(file.mimetype),
        fileSize: file.size,
        chapterId: chapterId,
        courseId: chapter.courseId,
      },
      include: {
        chapter: {
          select: {
            id: true,
            title: true,
            course: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: "Document uploaded successfully",
      data: {
        originalName: file.originalname,
        fileName: path.basename(file.filename),
        size: file.size,
        mimeType: file.mimetype,
        s3Key: s3Result.key,
        documentUrl: cloudfrontUrl,
        documentRecord: documentRecord,
      },
    });
  } catch (error) {
    console.error("Document upload error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// Upload multiple documents
export const uploadMultipleDocuments = async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    const { chapterId } = req.body;

    if (!files || files.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No documents uploaded" });
    }

    if (!chapterId) {
      return res
        .status(400)
        .json({ success: false, message: "Chapter ID is required" });
    }

    // Validate chapter exists
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      include: { course: { select: { id: true, title: true } } },
    });

    if (!chapter) {
      // cleanup local files
      files.forEach((file) => {
        fs.existsSync(file.path) && fs.unlink(file.path, () => {});
      });
      return res
        .status(404)
        .json({ success: false, message: "Chapter not found" });
    }

    const uploadResults = [];

    // Upload each document to S3
    for (const file of files) {
      try {
        const s3Result = await uploadLocalFileToS3(
          file.path,
          file.originalname,
          "documents"
        );
        const cloudfrontUrl = cloudfrontDomain + s3Result.key.split("/")[1];

        // Save document record to database
        const documentRecord = await prisma.document.create({
          data: {
            title: file.originalname,
            fileUrl: cloudfrontUrl,
            fileType: getFileType(file.mimetype),
            fileSize: file.size,
            chapterId: chapterId,
            courseId: chapter.courseId,
          },
        });

        uploadResults.push({
          originalName: file.originalname,
          fileName: path.basename(file.filename),
          size: file.size,
          mimeType: file.mimetype,
          s3Key: s3Result.key,
          documentUrl: cloudfrontUrl,
          documentRecord: documentRecord,
        });

        // Clean up local file
        fs.existsSync(file.path) && fs.unlink(file.path, () => {});
      } catch (error) {
        console.error(`Error uploading ${file.originalname}:`, error);
        // Clean up local file on error
        fs.existsSync(file.path) && fs.unlink(file.path, () => {});
        uploadResults.push({
          originalName: file.originalname,
          error: "Upload failed",
        });
      }
    }

    const successCount = uploadResults.filter((result) => !result.error).length;
    const errorCount = uploadResults.filter((result) => result.error).length;

    res.status(201).json({
      success: true,
      message: `${successCount} documents uploaded successfully${
        errorCount > 0 ? `, ${errorCount} failed` : ""
      }`,
      data: {
        totalFiles: files.length,
        successCount,
        errorCount,
        results: uploadResults,
      },
    });
  } catch (error) {
    console.error("Multiple document upload error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// Delete document
export const deleteDocument = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        chapter: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Extract S3 key from CloudFront URL
    const s3Key = document.fileUrl.replace(cloudfrontDomain, "");

    // Delete from S3
    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: s3Key,
        })
      );
    } catch (s3Error) {
      console.error("Error deleting from S3:", s3Error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete document from storage",
      });
    }

    // Delete from database
    await prisma.document.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting document:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// ===== HELPER FUNCTIONS =====

// Upload file to S3
async function uploadLocalFileToS3(
  localFilePath: string,
  originalName: string,
  type: string = "general"
): Promise<{ key: string }> {
  if (!bucket) {
    throw new Error("S3 bucket not configured");
  }
  if (!fs.existsSync(localFilePath)) {
    throw new Error(`Local file not found: ${localFilePath}`);
  }

  const ext = path.extname(originalName) || ".jpg";
  const key = `${type}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}${ext}`;
  const contentType = inferContentType(ext);

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(localFilePath),
      ContentType: contentType,
    })
  );

  return { key };
}

// Get file type based on MIME type
function getFileType(mimeType: string): string {
  if (mimeType.startsWith("image/")) {
    return "image";
  } else if (mimeType === "application/pdf") {
    return "pdf";
  } else if (mimeType.includes("word") || mimeType.includes("document")) {
    return "document";
  } else if (mimeType.includes("excel") || mimeType.includes("spreadsheet")) {
    return "spreadsheet";
  } else if (
    mimeType.includes("powerpoint") ||
    mimeType.includes("presentation")
  ) {
    return "presentation";
  } else if (mimeType.startsWith("text/")) {
    return "text";
  } else {
    return "other";
  }
}

// Infer content type from file extension
function inferContentType(ext: string): string {
  switch (ext.toLowerCase()) {
    // Images
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    // Documents
    case ".pdf":
      return "application/pdf";
    case ".doc":
      return "application/msword";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".xls":
      return "application/vnd.ms-excel";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".ppt":
      return "application/vnd.ms-powerpoint";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case ".txt":
      return "text/plain";
    case ".csv":
      return "text/csv";
    default:
      return "application/octet-stream";
  }
}
