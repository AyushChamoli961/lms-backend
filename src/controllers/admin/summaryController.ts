import { Request, Response } from "express";
import prisma from "../../lib/db";

// Create a new summary
export const createSummary = async (req: Request, res: Response) => {
  try {
    const { chapterId, title, content, imgUrl } = req.body;

    // Validate required fields
    if (!chapterId || !title || !content) {
      return res.status(400).json({
        success: false,
        message: "Required fields: chapterId, title, content",
      });
    }

    // Check if chapter exists
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
    });

    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: "Chapter not found",
      });
    }

    // Check if summary already exists for this chapter
    // const existingSummary = await prisma.summary.findUnique({
    //   where: { chapterId },
    // });

    // if (existingSummary) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Summary already exists for this chapter",
    //   });
    // }

    const summary = await prisma.summary.create({
      data: {
        chapterId,
        title,
        content,
        imgUrl: imgUrl || "",
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
      message: "Summary created successfully",
      data: summary,
    });
  } catch (error) {
    console.error("Error creating summary:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Get all summaries with pagination
export const getAllSummaries = async (req: Request, res: Response) => {
  try {
    const { page = "1", limit = "20", courseId } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause for prisma query
    const where: any = {};
    if (courseId) {
      where.chapter = {
        courseId: courseId as string,
      };
    }

    const [summaries, total] = await Promise.all([
      prisma.summary.findMany({
        where,
        skip,
        take: limitNum,
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
        orderBy: { createdAt: "desc" },
      }),
      prisma.summary.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        summaries,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching summaries:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Get summary by ID
export const getSummaryById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const summary = await prisma.summary.findUnique({
      where: { id },
      include: {
        chapter: {
          select: {
            id: true,
            title: true,
            description: true,
            course: {
              select: {
                id: true,
                title: true,
                author: true,
              },
            },
          },
        },
      },
    });

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: "Summary not found",
      });
    }

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error fetching summary:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Get summary by chapter ID
export const getSummaryByChapterId = async (req: Request, res: Response) => {
  try {
    const { chapterId } = req.params;

    // Check if chapter exists
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
    });

    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: "Chapter not found",
      });
    }

    const summary = await prisma.summary.findMany({
      where: { chapterId },
      include: {
        chapter: {
          select: {
            id: true,
            title: true,
            description: true,
            course: {
              select: {
                id: true,
                title: true,
                author: true,
              },
            },
          },
        },
      },
    });

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: "Summary not found for this chapter",
      });
    }

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error fetching summary by chapter:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Update summary
export const updateSummary = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, content, imgUrl } = req.body;

    // Check if summary exists
    const existingSummary = await prisma.summary.findUnique({
      where: { id },
    });

    if (!existingSummary) {
      return res.status(404).json({
        success: false,
        message: "Summary not found",
      });
    }

    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: "Required fields: title, content",
      });
    }

    const updatedSummary = await prisma.summary.update({
      where: { id },
      data: {
        title,
        content,
        imgUrl: imgUrl || existingSummary.imgUrl,
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

    res.status(200).json({
      success: true,
      message: "Summary updated successfully",
      data: updatedSummary,
    });
  } catch (error) {
    console.error("Error updating summary:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Delete summary
export const deleteSummary = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if summary exists
    const summary = await prisma.summary.findUnique({
      where: { id },
    });

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: "Summary not found",
      });
    }

    await prisma.summary.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Summary deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting summary:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Get summaries by course ID
export const getSummariesByCourse = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    const { page = "1", limit = "20" } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

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

    const [summaries, total] = await Promise.all([
      prisma.summary.findMany({
        where: {
          chapter: {
            courseId,
          },
        },
        skip,
        take: limitNum,
        include: {
          chapter: {
            select: {
              id: true,
              title: true,
              order: true,
              course: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
        },
        orderBy: {
          chapter: {
            order: "asc",
          },
        },
      }),
      prisma.summary.count({
        where: {
          chapter: {
            courseId,
          },
        },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        course: {
          id: course.id,
          title: course.title,
        },
        summaries,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching summaries by course:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Bulk create summaries
export const bulkCreateSummaries = async (req: Request, res: Response) => {
  try {
    const { summaries } = req.body;

    if (!Array.isArray(summaries) || summaries.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Summaries array is required and must not be empty",
      });
    }

    // Validate each summary
    for (const summary of summaries) {
      if (!summary.chapterId || !summary.title || !summary.content) {
        return res.status(400).json({
          success: false,
          message: "Each summary must have chapterId, title, and content",
        });
      }
    }

    // Check if chapters exist and summaries don't already exist
    const chapterIds = summaries.map((s) => s.chapterId);
    const chapters = await prisma.chapter.findMany({
      where: { id: { in: chapterIds } },
    });

    if (chapters.length !== chapterIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more chapters not found",
      });
    }

    const existingSummaries = await prisma.summary.findMany({
      where: { chapterId: { in: chapterIds } },
    });

    if (existingSummaries.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Summaries already exist for some chapters",
        existingChapters: existingSummaries.map((s) => s.chapterId),
      });
    }

    // Create summaries in a transaction
    const createdSummaries = await prisma.$transaction(
      summaries.map((summary) =>
        prisma.summary.create({
          data: {
            chapterId: summary.chapterId,
            title: summary.title,
            content: summary.content,
            imgUrl: summary.imgUrl || "",
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
        })
      )
    );

    res.status(201).json({
      success: true,
      message: `${createdSummaries.length} summaries created successfully`,
      data: createdSummaries,
    });
  } catch (error) {
    console.error("Error bulk creating summaries:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};
