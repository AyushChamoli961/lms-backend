import { Request, Response } from "express";
import { Video } from "../../config/mux";
import prisma from "../../lib/db";

// Generate direct upload URL for Mux
export const createDirectUploadUrl = async (req: Request, res: Response) => {
  try {
    const { chapterId } = req.params;

    // Check if chapter exists
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      include: {
        course: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: "Chapter not found",
      });
    }

    // Create direct upload URL with Mux
    const upload = await Video.uploads.create({
      new_asset_settings: {
        playback_policy: ["public"],
        encoding_tier: "smart",
        normalize_audio: true,
        mp4_support: "standard",
        test: false,
      },
      cors_origin: process.env.FRONTEND_URL || "http://localhost:3000", // Your frontend URL
      timeout: 3600, // 1 hour timeout
    });

    // Store the upload ID temporarily to link with chapter later
    await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        videoStatus: "uploading",
        // Store upload ID in a temp field or use a separate table
      },
    });

    res.status(200).json({
      success: true,
      message: "Direct upload URL created",
      data: {
        uploadUrl: upload.url,
        uploadId: upload.id,
        chapterId: chapterId,
        timeout: upload.timeout,
        instructions: {
          method: "PUT",
          headers: {
            "Content-Type": "video/*", // or specific video type
          },
          note: "Upload video file directly to this URL using PUT request",
        },
      },
    });
  } catch (error) {
    console.error("Error creating direct upload URL:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create upload URL",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Handle upload completion (called after direct upload)
export const handleUploadComplete = async (req: Request, res: Response) => {
  try {
    const { uploadId, chapterId } = req.body;

    if (!uploadId || !chapterId) {
      return res.status(400).json({
        success: false,
        message: "Upload ID and Chapter ID are required",
      });
    }

    // Get upload details from Mux
    const upload = await Video.uploads.retrieve(uploadId);

    if (upload.asset_id) {
      // Update chapter with asset ID
      await prisma.chapter.update({
        where: { id: chapterId },
        data: {
          muxAssetId: upload.asset_id,
          videoStatus: "processing",
        },
      });

      res.status(200).json({
        success: true,
        message: "Upload completed, video is being processed",
        data: {
          assetId: upload.asset_id,
          status: "processing",
        },
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Upload not completed or failed",
      });
    }
  } catch (error) {
    console.error("Error handling upload completion:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process upload completion",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};
