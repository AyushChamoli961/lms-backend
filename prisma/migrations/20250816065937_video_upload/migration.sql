-- AlterTable
ALTER TABLE "public"."Chapter" ADD COLUMN     "muxAssetId" TEXT,
ADD COLUMN     "muxPlaybackId" TEXT,
ADD COLUMN     "videoStatus" TEXT DEFAULT 'pending',
ALTER COLUMN "videoUrl" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Chapter_muxAssetId_idx" ON "public"."Chapter"("muxAssetId");
