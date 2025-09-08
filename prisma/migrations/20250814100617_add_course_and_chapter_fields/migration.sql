/*
  Warnings:

  - You are about to drop the column `coinValue` on the `Course` table. All the data in the column will be lost.
  - You are about to drop the column `courseId` on the `Quiz` table. All the data in the column will be lost.
  - You are about to drop the `Lecture` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LectureProgress` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[quizId,order]` on the table `Question` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,quizId]` on the table `QuizResult` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `category` to the `Course` table without a default value. This is not possible if the table is not empty.
  - Added the required column `order` to the `Question` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Question` table without a default value. This is not possible if the table is not empty.
  - Added the required column `chapterId` to the `Quiz` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `Quiz` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Quiz` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."courseCategory" AS ENUM ('FOREX', 'STOCKS', 'CRYPTO');

-- CreateEnum
CREATE TYPE "public"."DifficultyLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- DropForeignKey
ALTER TABLE "public"."Document" DROP CONSTRAINT "Document_courseId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Lecture" DROP CONSTRAINT "Lecture_courseId_fkey";

-- DropForeignKey
ALTER TABLE "public"."LectureProgress" DROP CONSTRAINT "LectureProgress_lectureId_fkey";

-- DropForeignKey
ALTER TABLE "public"."LectureProgress" DROP CONSTRAINT "LectureProgress_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Question" DROP CONSTRAINT "Question_quizId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Quiz" DROP CONSTRAINT "Quiz_courseId_fkey";

-- AlterTable
ALTER TABLE "public"."Course" DROP COLUMN "coinValue",
ADD COLUMN     "category" "public"."courseCategory" NOT NULL,
ADD COLUMN     "difficulty" "public"."DifficultyLevel",
ADD COLUMN     "estimatedDuration" INTEGER,
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "price" INTEGER,
ADD COLUMN     "thumbnail" TEXT;

-- AlterTable
ALTER TABLE "public"."Document" ADD COLUMN     "chapterId" TEXT,
ADD COLUMN     "fileSize" INTEGER,
ADD COLUMN     "fileType" TEXT;

-- AlterTable
ALTER TABLE "public"."Question" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "imgUrl" TEXT,
ADD COLUMN     "order" INTEGER NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "public"."Quiz" DROP COLUMN "courseId",
ADD COLUMN     "chapterId" TEXT NOT NULL,
ADD COLUMN     "coinValue" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- DropTable
DROP TABLE "public"."Lecture";

-- DropTable
DROP TABLE "public"."LectureProgress";

-- CreateTable
CREATE TABLE "public"."Chapter" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "videoUrl" TEXT NOT NULL,
    "duration" INTEGER,
    "order" INTEGER NOT NULL,
    "courseId" TEXT NOT NULL,
    "coinValue" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chapterProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapterProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Chapter_courseId_idx" ON "public"."Chapter"("courseId");

-- CreateIndex
CREATE INDEX "Chapter_isPublished_idx" ON "public"."Chapter"("isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_courseId_order_key" ON "public"."Chapter"("courseId", "order");

-- CreateIndex
CREATE INDEX "chapterProgress_userId_idx" ON "public"."chapterProgress"("userId");

-- CreateIndex
CREATE INDEX "chapterProgress_chapterId_idx" ON "public"."chapterProgress"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "chapterProgress_userId_chapterId_key" ON "public"."chapterProgress"("userId", "chapterId");

-- CreateIndex
CREATE INDEX "Course_category_idx" ON "public"."Course"("category");

-- CreateIndex
CREATE INDEX "Course_isPublished_idx" ON "public"."Course"("isPublished");

-- CreateIndex
CREATE INDEX "Course_difficulty_idx" ON "public"."Course"("difficulty");

-- CreateIndex
CREATE INDEX "Document_courseId_idx" ON "public"."Document"("courseId");

-- CreateIndex
CREATE INDEX "Document_chapterId_idx" ON "public"."Document"("chapterId");

-- CreateIndex
CREATE INDEX "Question_quizId_idx" ON "public"."Question"("quizId");

-- CreateIndex
CREATE UNIQUE INDEX "Question_quizId_order_key" ON "public"."Question"("quizId", "order");

-- CreateIndex
CREATE INDEX "Quiz_chapterId_idx" ON "public"."Quiz"("chapterId");

-- CreateIndex
CREATE INDEX "Quiz_isPublished_idx" ON "public"."Quiz"("isPublished");

-- CreateIndex
CREATE INDEX "QuizResult_userId_idx" ON "public"."QuizResult"("userId");

-- CreateIndex
CREATE INDEX "QuizResult_quizId_idx" ON "public"."QuizResult"("quizId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizResult_userId_quizId_key" ON "public"."QuizResult"("userId", "quizId");

-- AddForeignKey
ALTER TABLE "public"."Chapter" ADD CONSTRAINT "Chapter_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "public"."Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "public"."Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "public"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Quiz" ADD CONSTRAINT "Quiz_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "public"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Question" ADD CONSTRAINT "Question_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "public"."Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chapterProgress" ADD CONSTRAINT "chapterProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chapterProgress" ADD CONSTRAINT "chapterProgress_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "public"."Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
