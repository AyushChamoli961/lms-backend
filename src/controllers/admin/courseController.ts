import { Request, Response } from "express";
import prisma from "../../lib/db";
import { $Enums } from "@prisma/client";

// Create a new course
export const createCourse = async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      overview,
      thumbnail,
      category,
      tags,
      difficulty,
      estimatedDuration,
      isPublished,
    } = req.body;

    // Validate required fields
    if (!title || !description || !overview) {
      return res.status(400).json({
        success: false,
        message:
          "Required fields: title, description, overview, category, author",
      });
    }

    // Validate category enum
    // if (!Object.values($Enums.courseCategory).includes(category)) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Invalid category. Must be one of: FOREX, STOCKS, CRYPTO",
    //   });
    // }

    // Validate difficulty enum if provided
    if (
      difficulty &&
      !Object.values($Enums.DifficultyLevel).includes(difficulty)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid difficulty. Must be one of: BEGINNER, INTERMEDIATE, ADVANCED",
      });
    }

    const course = await prisma.course.create({
      data: {
        title,
        description,
        overview,
        thumbnail,
        tags: tags || [],
        difficulty,
        estimatedDuration,
        isPublished: isPublished || false,
      },
      include: {
        chapters: {
          orderBy: { order: "asc" },
        },
        documents: true,
        _count: {
          select: {
            chapters: true,
            documents: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: "Course created successfully",
      data: course,
    });
  } catch (error) {
    console.error("Error creating course:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Get all courses with optional filtering
export const getAllCourses = async (req: Request, res: Response) => {
  try {
    const {
      category,
      difficulty,
      isPublished,
      author,
      page = "1",
      limit = "10",
      search,
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {};

    if (category) where.category = category;
    if (difficulty) where.difficulty = difficulty;
    if (isPublished !== undefined) where.isPublished = isPublished === "true";
    if (author)
      where.author = { contains: author as string, mode: "insensitive" };
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: "insensitive" } },
        { description: { contains: search as string, mode: "insensitive" } },
        { author: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        skip,
        take: limitNum,
        include: {
          chapters: {
            where: { isPublished: true },
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              order: true,
              duration: true,
              coinValue: true,
              isPublished: true,
            },
          },
          documents: true,
          _count: {
            select: {
              chapters: true,
              documents: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.course.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        courses,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Get a single course by ID
export const getCourseById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        chapters: {
          orderBy: { order: "asc" },
          include: {
            summary: true,
            documents: true,
            quizzes: {
              include: {
                questions: {
                  orderBy: { order: "asc" },
                },
              },
            },
            _count: {
              select: {
                progress: true,
              },
            },
          },
        },

        documents: true,
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

    res.status(200).json({
      success: true,
      data: course,
    });
  } catch (error) {
    console.error("Error fetching course:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Update a course
export const updateCourse = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if course exists
    const existingCourse = await prisma.course.findUnique({
      where: { id },
    });

    if (!existingCourse) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Validate category if provided
    if (
      updateData.category &&
      !Object.values($Enums.courseCategory).includes(updateData.category)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid category. Must be one of: FOREX, STOCKS, CRYPTO",
      });
    }

    // Validate difficulty if provided
    if (
      updateData.difficulty &&
      !Object.values($Enums.DifficultyLevel).includes(updateData.difficulty)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid difficulty. Must be one of: BEGINNER, INTERMEDIATE, ADVANCED",
      });
    }

    const updatedCourse = await prisma.course.update({
      where: { id },
      data: updateData,
      include: {
        chapters: {
          orderBy: { order: "asc" },
        },
        documents: true,
        _count: {
          select: {
            chapters: true,
            documents: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Course updated successfully",
      data: updatedCourse,
    });
  } catch (error) {
    console.error("Error updating course:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Delete a course
export const deleteCourse = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if course exists
    const existingCourse = await prisma.course.findUnique({
      where: { id },
    });

    if (!existingCourse) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    await prisma.course.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Course deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting course:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Toggle course publish status
export const toggleCoursePublishStatus = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;

    const course = await prisma.course.findUnique({
      where: { id },
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const updatedCourse = await prisma.course.update({
      where: { id },
      data: {
        isPublished: !course.isPublished,
      },
    });

    res.status(200).json({
      success: true,
      message: `Course ${
        updatedCourse.isPublished ? "published" : "unpublished"
      } successfully`,
      data: updatedCourse,
    });
  } catch (error) {
    console.error("Error toggling course publish status:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Get course statistics (for admin dashboard)
export const getCourseStats = async (req: Request, res: Response) => {
  try {
    const [
      totalCourses,
      publishedCourses,
      unpublishedCourses,
      coursesByCategory,
    ] = await Promise.all([
      prisma.course.count(),
      prisma.course.count({ where: { isPublished: true } }),
      prisma.course.count({ where: { isPublished: false } }),
      prisma.course.groupBy({
        by: ["category"],
        _count: {
          id: true,
        },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalCourses,
        publishedCourses,
        unpublishedCourses,
        coursesByCategory,
      },
    });
  } catch (error) {
    console.error("Error fetching course stats:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};
