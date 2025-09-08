import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthedRequest } from "../../middleware/admin";

const prisma = new PrismaClient();

// Course Discovery & Browsing

export const getCourses = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      category,
      difficulty,
      tags,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    // Build filter conditions
    const where: any = {
      isPublished: true,
    };

    // Search functionality - searches in title, description, overview, and author
    if (search && typeof search === "string") {
      const searchTerm = search.trim();
      if (searchTerm) {
        where.OR = [
          {
            title: {
              contains: searchTerm,
              mode: "insensitive",
            },
          },
          {
            description: {
              contains: searchTerm,
              mode: "insensitive",
            },
          },
          {
            overview: {
              contains: searchTerm,
              mode: "insensitive",
            },
          },
          {
            author: {
              contains: searchTerm,
              mode: "insensitive",
            },
          },
        ];
      }
    }

    // Category filter - let Prisma handle enum validation
    if (category && typeof category === "string") {
      where.category = category;
    }

    if (difficulty) {
      where.difficulty = difficulty;
    }

    if (tags && Array.isArray(tags)) {
      where.tags = {
        hasSome: tags,
      };
    }

    // Build sort conditions
    const orderBy: any = {};
    orderBy[sortBy as string] = sortOrder;

    const courses = await prisma.course.findMany({
      where,
      include: {
        chapters: {
          where: { isPublished: true },
          select: {
            id: true,
            title: true,
            duration: true,
            order: true,
          },
          orderBy: { order: "asc" },
        },
        _count: {
          select: {
            chapters: {
              where: { isPublished: true },
            },
          },
        },
      },
      orderBy,
      skip,
      take: Number(limit),
    });

    const total = await prisma.course.count({ where });

    res.json({
      success: true,
      data: courses,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch courses",
    });
  }
};

export const getCourseById = async (req: AuthedRequest, res: Response) => {
  try {
    const { courseId } = req.params;
    const userId = req.user?.id;

    console.log("courseId", courseId);
    console.log("userId", userId);

    const course = await prisma.course.findFirst({
      where: {
        id: courseId,
        isPublished: true,
      },
      include: {
        chapters: {
          where: { isPublished: true },
          select: {
            id: true,
            title: true,
            duration: true,
            order: true,
            quizzes: {
              // Remove isPublished filter to show all quizzes (like your original)
              select: {
                id: true,
                title: true,
                chapterId: true,
                coinValue: true,
                passScore: true,
                duration: true,
                isPublished: true,
                createdAt: true,
                updatedAt: true,
                results: {
                  where: {
                    userId,
                  },
                  select: {
                    id: true,
                    score: true,
                    passed: true,
                    attemptedAt: true,
                  },
                },
              },
            },
          },
          orderBy: { order: "asc" },
        },
        documents: {
          where: { chapterId: null }, // Course-level documents
        },
        _count: {
          select: {
            chapters: true,
            documents: true,
          },
        },
      },
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const isEnrolled = await prisma.enrolledCourse.findFirst({
      where: {
        userId,
        courseId: course.id,
      },
      select: {
        id: true,
      },
    });

    // Get user's chapter progress if authenticated
    let chapterProgress: Array<{
      chapterId: string;
      completed: boolean;
      watchedAt: Date;
    }> = [];
    if (userId) {
      chapterProgress = await prisma.chapterProgress.findMany({
        where: {
          userId,
          chapter: {
            courseId: courseId,
          },
        },
        select: {
          chapterId: true,
          completed: true,
          watchedAt: true,
        },
      });
    }

    // Transform chapters to include isCompleted field and quiz completion status
    const transformedChapters = course.chapters.map((chapter) => {
      const userChapterProgress = chapterProgress.find(
        (p) => p.chapterId === chapter.id
      );

      // Transform quizzes to include completion status
      const transformedQuizzes = chapter.quizzes.map((quiz) => {
        const userResult = quiz.results[0] || null; // Get the latest result

        return {
          id: quiz.id,
          title: quiz.title,
          chapterId: quiz.chapterId,
          coinValue: quiz.coinValue,
          passScore: quiz.passScore,
          duration: quiz.duration,
          isPublished: quiz.isPublished,
          createdAt: quiz.createdAt,
          updatedAt: quiz.updatedAt,
          results: quiz.results, // Keep original results structure
          isCompleted: userResult?.passed || false, // Only completed if passed
          userResult: userResult
            ? {
                id: userResult.id,
                score: userResult.score,
                passed: userResult.passed,
                attemptedAt: userResult.attemptedAt,
              }
            : null,
        };
      });

      return {
        id: chapter.id,
        title: chapter.title,
        duration: chapter.duration,
        order: chapter.order,
        isCompleted: userChapterProgress
          ? userChapterProgress.completed
          : false,
        quizzes: transformedQuizzes,
      };
    });

    // Calculate user progress if user is authenticated
    let userProgress = null;
    if (userId) {
      const totalChapters = course.chapters.length;
      const completedChapters = chapterProgress.filter(
        (p) => p.completed
      ).length;

      // Calculate total quizzes and completed quizzes across all chapters
      const totalQuizzes = course.chapters.reduce(
        (total, chapter) => total + chapter.quizzes.length,
        0
      );
      const completedQuizzes = course.chapters.reduce(
        (total, chapter) =>
          total +
          chapter.quizzes.filter(
            (quiz) => quiz.results.length > 0 && quiz.results[0].passed
          ).length,
        0
      );

      const progressPercentage =
        totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0;

      userProgress = {
        totalChapters,
        completedChapters,
        totalQuizzes,
        completedQuizzes,
        progressPercentage,
        lastWatchedChapter:
          chapterProgress.length > 0
            ? chapterProgress.sort(
                (a, b) =>
                  new Date(b.watchedAt).getTime() -
                  new Date(a.watchedAt).getTime()
              )[0]
            : null,
      };
    }

    res.json({
      success: true,
      data: {
        id: course.id,
        title: course.title,
        description: course.description,
        overview: course.overview,
        thumbnail: course.thumbnail, // This was missing
        category: course.category,
        difficulty: course.difficulty,
        tags: course.tags,
        author: course.author,
        price: course.price,
        isPublished: course.isPublished, // This was missing
        estimatedDuration: course.estimatedDuration, // This was missing
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
        chapters: transformedChapters,
        documents: course.documents,
        _count: course._count,
        userProgress,
        isEnrolled: !!isEnrolled,
      },
    });
  } catch (error) {
    console.error("Error fetching course:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch course",
    });
  }
};

export const getFeaturedCourses = async (req: Request, res: Response) => {
  try {
    const { limit = 6 } = req.query;

    // Get featured courses (you can add a featured field to the Course model later)
    // For now, getting the most recent published courses
    const courses = await prisma.course.findMany({
      where: {
        isPublished: true,
      },
      include: {
        chapters: {
          where: { isPublished: true },
          select: {
            id: true,
            title: true,
            duration: true,
          },
        },
        _count: {
          select: {
            chapters: {
              where: { isPublished: true },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: Number(limit),
    });

    res.json({
      success: true,
      data: courses,
    });
  } catch (error) {
    console.error("Error fetching featured courses:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch featured courses",
    });
  }
};

export const searchCourses = async (req: Request, res: Response) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || typeof q !== "string") {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    const courses = await prisma.course.findMany({
      where: {
        isPublished: true,
        OR: [
          {
            title: {
              contains: q,
              mode: "insensitive",
            },
          },
          {
            description: {
              contains: q,
              mode: "insensitive",
            },
          },
          {
            tags: {
              hasSome: [q],
            },
          },
        ],
      },
      include: {
        chapters: {
          where: { isPublished: true },
          select: {
            id: true,
            title: true,
            duration: true,
          },
        },
        _count: {
          select: {
            chapters: {
              where: { isPublished: true },
            },
          },
        },
      },
      take: Number(limit),
    });

    res.json({
      success: true,
      data: courses,
    });
  } catch (error) {
    console.error("Error searching courses:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search courses",
    });
  }
};

export const getCoursesByCategory = async (req: Request, res: Response) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const courses = await prisma.course.findMany({
      where: {
        category: category as any,
        isPublished: true,
      },
      include: {
        chapters: {
          where: { isPublished: true },
          select: {
            id: true,
            title: true,
            duration: true,
          },
        },
        _count: {
          select: {
            chapters: {
              where: { isPublished: true },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: Number(limit),
    });

    const total = await prisma.course.count({
      where: {
        category: category as any,
        isPublished: true,
      },
    });

    res.json({
      success: true,
      data: courses,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching courses by category:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch courses by category",
    });
  }
};
