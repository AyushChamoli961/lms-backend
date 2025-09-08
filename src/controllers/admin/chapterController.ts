import { Request, Response } from "express";
import prisma from "../../lib/db";
// Create a new chapter
export const createChapter = async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      videoUrl,
      duration,
      order,
      courseId,
      coinValue,
      isPublished,
    } = req.body;

    // Validate required fields
    if (!title || !courseId || order === undefined) {
      return res.status(400).json({
        success: false,
        message: "Required fields: title, courseId, order",
      });
    }

    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Check if order already exists for this course
    const existingChapter = await prisma.chapter.findFirst({
      where: {
        courseId,
        order,
      },
    });

    if (existingChapter) {
      return res.status(400).json({
        success: false,
        message: "Chapter order already exists for this course",
      });
    }

    const chapter = await prisma.chapter.create({
      data: {
        title,
        description,
        videoUrl,
        duration,
        order,
        courseId,
        coinValue: coinValue || 0,
        isPublished: isPublished || false,
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
          },
        },
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
            documents: true,
            quizzes: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: "Chapter created successfully",
      data: chapter,
    });
  } catch (error) {
    console.error("Error creating chapter:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Get all chapters for a course
export const getChaptersByCourse = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    const { isPublished, page = "1", limit = "20" } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause for prisma query
    const where: any = { courseId };
    if (isPublished !== undefined) {
      where.isPublished = isPublished === "true";
    }

    // checks if course exists
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const [chapters, total] = await Promise.all([
      prisma.chapter.findMany({
        where,
        skip,
        take: limitNum,
        include: {
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
              documents: true,
              quizzes: true,
            },
          },
        },
        orderBy: { order: "asc" },
      }),
      prisma.chapter.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        course: {
          id: course.id,
          title: course.title,
        },
        chapters,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching chapters:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// gets a single chapter by ID
export const getChapterById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const chapter = await prisma.chapter.findUnique({
      where: { id },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            author: true,
          },
        },
        documents: true,
        quizzes: {
          include: {
            questions: {
              include: {
                options: true,
              },
              orderBy: { order: "asc" },
            },
          },
        },
        progress: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            progress: true,
            documents: true,
            quizzes: true,
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

    res.status(200).json({
      success: true,
      data: chapter,
    });
  } catch (error) {
    console.error("Error fetching chapter:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Update a chapter
export const updateChapter = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if chapter exists
    const existingChapter = await prisma.chapter.findUnique({
      where: { id },
    });

    if (!existingChapter) {
      return res.status(404).json({
        success: false,
        message: "Chapter not found",
      });
    }

    // If order is being updated, check for conflicts
    if (updateData.order && updateData.order !== existingChapter.order) {
      const conflictingChapter = await prisma.chapter.findFirst({
        where: {
          courseId: existingChapter.courseId,
          order: updateData.order,
          id: { not: id },
        },
      });

      if (conflictingChapter) {
        return res.status(400).json({
          success: false,
          message: "Chapter order already exists for this course",
        });
      }
    }

    const updatedChapter = await prisma.chapter.update({
      where: { id },
      data: updateData,
      include: {
        course: {
          select: {
            id: true,
            title: true,
          },
        },
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
            documents: true,
            quizzes: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Chapter updated successfully",
      data: updatedChapter,
    });
  } catch (error) {
    console.error("Error updating chapter:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Delete a chapter
export const deleteChapter = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if chapter exists
    const existingChapter = await prisma.chapter.findUnique({
      where: { id },
    });

    if (!existingChapter) {
      return res.status(404).json({
        success: false,
        message: "Chapter not found",
      });
    }

    await prisma.chapter.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Chapter deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting chapter:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Toggle chapter publish status
export const toggleChapterPublishStatus = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;

    const chapter = await prisma.chapter.findUnique({
      where: { id },
    });

    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: "Chapter not found",
      });
    }

    const updatedChapter = await prisma.chapter.update({
      where: { id },
      data: {
        isPublished: !chapter.isPublished,
      },
    });

    res.status(200).json({
      success: true,
      message: `Chapter ${
        updatedChapter.isPublished ? "published" : "unpublished"
      } successfully`,
      data: updatedChapter,
    });
  } catch (error) {
    console.error("Error toggling chapter publish status:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Reorder chapters within a course
export const reorderChapters = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    const { chapterOrders } = req.body; // Array of { id, order }

    if (!Array.isArray(chapterOrders)) {
      return res.status(400).json({
        success: false,
        message: "chapterOrders must be an array of { id, order } objects",
      });
    }

    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Validate all chapters belong to the course
    const chapterIds = chapterOrders.map((item) => item.id);
    const chapters = await prisma.chapter.findMany({
      where: {
        id: { in: chapterIds },
        courseId,
      },
    });

    if (chapters.length !== chapterIds.length) {
      return res.status(400).json({
        success: false,
        message: "Some chapters do not belong to this course",
      });
    }

    // Update chapter orders in a transaction
    const updatePromises = chapterOrders.map(({ id, order }) =>
      prisma.chapter.update({
        where: { id },
        data: { order },
      })
    );

    await prisma.$transaction(updatePromises);

    // Fetch updated chapters
    const updatedChapters = await prisma.chapter.findMany({
      where: { courseId },
      orderBy: { order: "asc" },
      include: {
        _count: {
          select: {
            progress: true,
            documents: true,
            quizzes: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Chapters reordered successfully",
      data: updatedChapters,
    });
  } catch (error) {
    console.error("Error reordering chapters:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Get chapter statistics
export const getChapterStats = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const chapter = await prisma.chapter.findUnique({
      where: { id },
      include: {
        progress: true,
        _count: {
          select: {
            progress: true,
            documents: true,
            quizzes: true,
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

    const completedCount = chapter.progress.filter((p) => p.completed).length;
    const totalEnrolledUsers = chapter.progress.length;

    res.status(200).json({
      success: true,
      data: {
        chapterInfo: {
          id: chapter.id,
          title: chapter.title,
          isPublished: chapter.isPublished,
          coinValue: chapter.coinValue,
        },
        stats: {
          totalEnrolledUsers,
          completedCount,
          completionRate:
            totalEnrolledUsers > 0
              ? (completedCount / totalEnrolledUsers) * 100
              : 0,
          documentsCount: chapter._count.documents,
          quizzesCount: chapter._count.quizzes,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching chapter stats:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};
