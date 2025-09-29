import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthedRequest } from "../../middleware/admin";

const prisma = new PrismaClient();

// Course Discovery & Browsing

// Common function to calculate total coins for courses
const calculateTotalCoins = (courses: any[]) => {
  return courses.map((course) => ({
    ...course,
    totalCoins: course.chapters.reduce((sum: number, chapter: any) => {
      const chapterCoins = chapter.coinValue || 0;
      // const quizCoins = chapter.quizzes
      //   ? chapter.quizzes.reduce(
      //       (quizSum: number, quiz: any) => quizSum + (quiz.coinValue || 0),
      //       0
      //     )
      //   : 0;
      return sum + chapterCoins;
    }, 0),
    // chapters: course.chapters.map(({ coinValue, ...chapter }: any) => ({
    //   ...chapter,
    //   quizzes: chapter.quizzes
    //     ? chapter.quizzes.map(
    //         ({ coinValue: quizCoinValue, ...quiz }: any) => quiz
    //       )
    //     : chapter.quizzes,
    // })),
  }));
};

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
            coinValue: true, // Add this to get coin values
            quizzes: {
              select: {
                coinValue: true, // Add quiz coinValue
              },
            },
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

    // Use the common calculateTotalCoins function
    const coursesWithTotalCoins = calculateTotalCoins(courses);

    const total = await prisma.course.count({ where });

    res.json({
      success: true,
      data: coursesWithTotalCoins,
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
            coinValue: true,
            quizzes: {
              select: {
                id: true,
                coinValue: true,
                results: {
                  where: {
                    userId,
                    passed: true, // Only get passed results
                  },
                  select: {
                    id: true,
                    passed: true,
                  },
                  take: 1, // Only get one result
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

      // Transform quizzes to match the new structure
      const transformedQuizzes = chapter.quizzes.map((quiz) => ({
        id: quiz.id,
        coinValue: quiz.coinValue,
        isPassed: quiz.results.length > 0, // True if there's a passed result
      }));

      const isCompleted = userChapterProgress
        ? userChapterProgress.completed
        : false;
      const allQuizzesPassed =
        transformedQuizzes.length > 0
          ? transformedQuizzes.every((quiz) => quiz.isPassed)
          : true; // If no quizzes, consider as passed

      return {
        id: chapter.id,
        title: chapter.title,
        duration: chapter.duration,
        order: chapter.order,
        isCompleted,
        chapterCompleted: isCompleted && allQuizzesPassed, // True when chapter is completed AND all quizzes are passed
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
          chapter.quizzes.filter((quiz) => quiz.results.length > 0).length,
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

    // Use the common calculateTotalCoins function for a single course
    const courseWithTotalCoins = calculateTotalCoins([course])[0];
    const totalCoins = courseWithTotalCoins.totalCoins;

    res.json({
      success: true,
      data: {
        id: course.id,
        title: course.title,
        description: course.description,
        overview: course.overview,
        thumbnail: course.thumbnail,
        category: course.category,
        difficulty: course.difficulty,
        tags: course.tags,
        author: course.author,
        price: course.price,
        isPublished: course.isPublished,
        estimatedDuration: course.estimatedDuration,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
        totalCoins, // Add total coins to the response
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
            coinValue: true, // Add coinValue
            quizzes: {
              select: {
                coinValue: true, // Add quiz coinValue
              },
            },
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

    const coursesWithTotalCoins = calculateTotalCoins(courses);

    res.json({
      success: true,
      data: coursesWithTotalCoins,
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
            coinValue: true, // Add coinValue
            quizzes: {
              select: {
                coinValue: true, // Add quiz coinValue
              },
            },
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

    const coursesWithTotalCoins = calculateTotalCoins(courses);

    res.json({
      success: true,
      data: coursesWithTotalCoins,
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
            coinValue: true, // Add coinValue
            quizzes: {
              select: {
                coinValue: true, // Add quiz coinValue
              },
            },
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

    const coursesWithTotalCoins = calculateTotalCoins(courses);

    const total = await prisma.course.count({
      where: {
        category: category as any,
        isPublished: true,
      },
    });

    res.json({
      success: true,
      data: coursesWithTotalCoins,
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
