import { Request, Response } from "express";
import multer from "multer";
import { Video, muxVideoSettings } from "../../config/mux";
import prisma from "../../lib/db";
import path from "path";
import fs from "fs";
import { uploadLocalVideoToS3 } from "../../config/s3";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/videos";
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

const fileFilter = (req: any, file: any, cb: any) => {
  if (file.mimetype.startsWith("video/")) {
    cb(null, true);
  } else {
    cb(new Error("Only video files are allowed!"), false);
  }
};

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024,
  },
});

export const uploadVideoToChapter = async (req: Request, res: Response) => {
  try {
    const { chapterId } = req.params;
    const file = req.file;

    if (!file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      include: { course: { select: { id: true, title: true } } },
    });

    if (!chapter) {
      fs.existsSync(file.path) && fs.unlink(file.path, () => {});
      return res
        .status(404)
        .json({ success: false, message: "Chapter not found" });
    }

    // ===== S3 Upload Step =====
    let s3Result;
    try {
      s3Result = await uploadLocalVideoToS3(file.path, file.originalname);
    } catch (s3Err) {
      console.error("S3 upload error:", s3Err);
      fs.existsSync(file.path) && fs.unlink(file.path, () => {});
      return res
        .status(500)
        .json({ success: false, message: "Failed to upload to storage" });
    }

    fs.existsSync(file.path) && fs.unlink(file.path, () => {});

    try {
      const meta = {
        c: chapterId,
        ct: chapter.title,
        crs: chapter.course.id,
        crst: chapter.course.title,
        fn: file.originalname,
        e: process.env.NODE_ENV,
      };
      let passthrough = JSON.stringify(meta);
      if (passthrough.length > 255) {
        meta.ct = meta.ct.slice(0, 40);
        meta.crst = meta.crst.slice(0, 40);
        meta.fn = meta.fn.slice(0, 40);
        passthrough = JSON.stringify(meta).slice(0, 255);
      }

      const asset = await Video.assets.create({
        ...muxVideoSettings,
        inputs: [
          {
            url: s3Result.presignedGetUrl,
          },
        ],
        passthrough,
      });

      await prisma.chapter.update({
        where: { id: chapterId },
        data: {
          muxAssetId: asset.id,
          videoStatus: "uploading",
        },
      });

      return res.status(201).json({
        success: true,
        message: "Video ingest started",
        data: {
          chapterId,
          assetId: asset.id,
          muxPlaybackIds: asset.playback_ids,
        },
      });
    } catch (muxError: any) {
      console.error("Mux asset create error:", muxError);
      return res.status(500).json({
        success: false,
        message: "Failed to create Mux asset",
        error: muxError?.message,
      });
    }
  } catch (error) {
    console.error("Upload error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

export const handleMuxWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers["mux-signature"] as string;
    const body = JSON.stringify(req.body);

    // if (!verifyMuxWebhook(body, signature)) {
    //   return res.status(401).json({ success: false, message: 'Invalid signature' });
    // }

    console.log("Received Mux webhook:", req.body);

    const { type, data } = req.body;

    switch (type) {
      case "video.asset.ready":
        await handleAssetReady(data);
        break;
      case "video.asset.errored":
        await handleAssetError(data);
        break;
      case "video.asset.deleted":
        await handleAssetDeleted(data);
        break;
      default:
        console.log("Unhandled webhook type:", type);
    }

    res.status(200).json({ success: true, message: "Webhook processed" });
  } catch (error) {
    console.error("Webhook processing error:", error);
    res.status(500).json({
      success: false,
      message: "Webhook processing failed",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

const handleAssetReady = async (assetData: any) => {
  try {
    const { id: muxAssetId, playback_ids, duration } = assetData;

    const chapter = await prisma.chapter.findFirst({
      where: { muxAssetId },
    });

    if (!chapter) {
      console.error("Chapter not found for Mux asset:", muxAssetId);
      return;
    }

    // Get the public playback ID
    const playbackId = playback_ids?.find(
      (pb: any) => pb.policy === "public"
    )?.id;

    if (playbackId) {
      // Update chapter with playback ID and ready status
      await prisma.chapter.update({
        where: { id: chapter.id },
        data: {
          muxPlaybackId: playbackId,
          videoStatus: "ready",
          duration: duration ? Math.round(duration) : chapter.duration,
          videoUrl: `https://stream.mux.com/${playbackId}.m3u8`,
        },
      });

      console.log(`Video processing complete for chapter ${chapter.id}`);
    }
  } catch (error) {
    console.error("Error handling asset ready:", error);
  }
};

const handleAssetError = async (assetData: any) => {
  try {
    const { id: muxAssetId } = assetData;

    const chapter = await prisma.chapter.findFirst({
      where: { muxAssetId },
    });

    if (!chapter) {
      console.error("Chapter not found for Mux asset:", muxAssetId);
      return;
    }

    await prisma.chapter.update({
      where: { id: chapter.id },
      data: {
        videoStatus: "error",
        muxAssetId: null,
        muxPlaybackId: null,
        videoUrl: null,
      },
    });

    console.log(`Video processing failed for chapter ${chapter.id}`);
  } catch (error) {
    console.error("Error handling asset error:", error);
  }
};

const handleAssetDeleted = async (assetData: any) => {
  try {
    const { id: muxAssetId } = assetData;

    const chapter = await prisma.chapter.findFirst({
      where: { muxAssetId },
    });

    if (chapter) {
      await prisma.chapter.update({
        where: { id: chapter.id },
        data: {
          muxAssetId: null,
          muxPlaybackId: null,
          videoUrl: null,
          videoStatus: "pending",
        },
      });
    }
  } catch (error) {
    console.error("Error handling asset deleted:", error);
  }
};

export const getVideoStatus = async (req: Request, res: Response) => {
  try {
    const { chapterId } = req.params;

    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: {
        id: true,
        title: true,
        videoUrl: true,
        muxAssetId: true,
        muxPlaybackId: true,
        videoStatus: true,
        duration: true,
      },
    });

    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: "Chapter not found",
      });
    }

    let muxAssetData = null;
    if (chapter.muxAssetId) {
      try {
        const asset = await Video.assets.retrieve(chapter.muxAssetId);
        muxAssetData = {
          status: asset.status,
          duration: asset.duration,
          aspectRatio: asset.aspect_ratio,
          resolutionTier: asset.resolution_tier,
          playbackIds: asset.playback_ids,
        };
      } catch (muxError) {
        console.error("Error fetching Mux asset:", muxError);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        chapter: {
          id: chapter.id,
          title: chapter.title,
          videoUrl: chapter.videoUrl,
          videoStatus: chapter.videoStatus,
          duration: chapter.duration,
        },
        mux: muxAssetData,
        streamingUrls: chapter.muxPlaybackId
          ? {
              hls: `https://stream.mux.com/${chapter.muxPlaybackId}.m3u8`,
              thumbnail: `https://image.mux.com/${chapter.muxPlaybackId}/thumbnail.png`,
              gif: `https://image.mux.com/${chapter.muxPlaybackId}/animated.gif`,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error getting video status:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

export const deleteVideo = async (req: Request, res: Response) => {
  try {
    const { chapterId } = req.params;

    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
    });

    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: "Chapter not found",
      });
    }

    if (chapter.muxAssetId) {
      try {
        await Video.assets.delete(chapter.muxAssetId);
      } catch (muxError) {
        console.error("Error deleting Mux asset:", muxError);
      }
    }

    // Clear video data from chapter
    const updatedChapter = await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        videoUrl: null,
        muxAssetId: null,
        muxPlaybackId: null,
        videoStatus: "pending",
        duration: null,
      },
    });

    res.status(200).json({
      success: true,
      message: "Video deleted successfully",
      data: updatedChapter,
    });
  } catch (error) {
    console.error("Error deleting video:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};
