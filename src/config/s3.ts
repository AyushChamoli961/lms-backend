import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";

const region = process.env.AWS_REGION!;
const bucket = process.env.AWS_S3_UPLOAD_BUCKET!;
const presignExpires = parseInt(process.env.S3_PRESIGN_EXPIRES || "3600", 10);

export const s3 = new S3Client({ region });

export interface S3UploadResult {
  key: string;
  publicUrl?: string;
  presignedGetUrl: string;
}

/**
 * Upload a local file to S3 and return a presigned GET URL (for Mux ingest)
 */
export async function uploadLocalVideoToS3(
  localFilePath: string,
  originalName: string
): Promise<S3UploadResult> {
  if (!bucket) {
    throw new Error("S3 bucket not configured");
  }
  if (!fs.existsSync(localFilePath)) {
    throw new Error(`Local file not found: ${localFilePath}`);
  }

  const ext = path.extname(originalName) || ".mp4";
  const key = `videos/${Date.now()}-${Math.random()
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

  const presignedGetUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: presignExpires }
  );

  return {
    key,
    presignedGetUrl,
  };
}

function inferContentType(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".mkv":
      return "video/x-matroska";
    case ".webm":
      return "video/webm";
    default:
      return "application/octet-stream";
  }
}
