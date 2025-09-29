import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthedRequest } from "../../middleware/admin";

const prisma = new PrismaClient();

// User Progress & Enrollment

export const getUserEnrolledCourses = async (
  req: AuthedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { page = 1, limit = 10 } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const skip = (Number(page) - 1) * Number(limit);

    // Get enrolled courses using the new EnrolledCourse model
    const enrolledCourses = await prisma.enrolledCourse.findMany({
      where: {
        userId,
        course: {
          isPublished: true,
        },
      },
      include: {
        course: {
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
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: Number(limit),
    });

    // Get user progress for all enrolled courses
    const courseIds = enrolledCourses.map((enrollment) => enrollment.courseId);
    const userProgress = await prisma.chapterProgress.findMany({
      where: {
        userId,
        chapter: {
          courseId: {
            in: courseIds,
          },
        },
        completed: true,
      },
      include: {
        chapter: {
          select: {
            courseId: true,
            title: true,
          },
        },
      },
    });

    // Calculate progress for each enrolled course
    const coursesWithProgress = enrolledCourses.map((enrollment) => {
      const courseProgress = userProgress.filter(
        (progress) => progress.chapter.courseId === enrollment.courseId
      );
      const completedChapters = courseProgress.length;
      const totalChapters = enrollment.course.chapters.length;
      const lastWatchedAt =
        courseProgress.length > 0
          ? courseProgress.sort(
              (a, b) =>
                new Date(b.watchedAt).getTime() -
                new Date(a.watchedAt).getTime()
            )[0].watchedAt
          : enrollment.createdAt;

      return {
        ...enrollment.course,
        enrollmentDate: enrollment.createdAt,
        progress: {
          completedChapters,
          totalChapters,
          percentage:
            totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0,
          lastWatchedAt,
        },
      };
    });

    const total = await prisma.enrolledCourse.count({
      where: {
        userId,
        course: {
          isPublished: true,
        },
      },
    });

    if (total === 0) {
      return res.status(404).json({
        success: false,
        message: "No enrolled courses found",
      });
    }

    res.json({
      success: true,
      data: coursesWithProgress,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching enrolled courses:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch enrolled courses",
    });
  }
};

export const markChapterAsWatched = async (
  req: AuthedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { chapterId } = req.params;
    const { completed = true, currentTime = 0 } = req.body;

    console.log("chapterId", chapterId);
    console.log("completed", completed);
    console.log("currentTime", currentTime);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Check if chapter exists and is published
    const chapter = await prisma.chapter.findFirst({
      where: {
        id: chapterId,
        isPublished: true,
      },
      include: {
        course: true,
      },
    });

    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: "Chapter not found",
      });
    }

    // Upsert progress record
    const progress = await prisma.chapterProgress.upsert({
      where: {
        userId_chapterId: {
          userId,
          chapterId,
        },
      },
      update: {
        currentTime: Number(currentTime),
        watchedAt: new Date(),
        completed: true,
      },
      create: {
        userId,
        chapterId,
        currentTime: Number(currentTime),
        watchedAt: new Date(),
        completed: true,
      },
    });

    // Award coins if chapter is completed and has coin value
    // let coinsAwarded = 0;
    // if (completed && chapter.coinValue > 0) {
    //   // Check if this is the first time completing this chapter
    //   const existingProgress = await prisma.chapterProgress.findUnique({
    //     where: {
    //       userId_chapterId: {
    //         userId,
    //         chapterId,
    //       },
    //     },
    //   });

    //     // Use database transaction to ensure data consistency
    //     await prisma.$transaction(async (tx) => {
    //       // Get or create wallet for the user
    //       let wallet = await tx.wallet.findUnique({ where: { userId } });
    //       if (!wallet) {
    //         wallet = await tx.wallet.create({
    //           data: {
    //             userId,
    //             balance: 0,
    //           },
    //         });
    //       }

    //       // Add transaction record
    //       await tx.transaction.create({
    //         data: {
    //           walletId: wallet.id,
    //           type: "EARNED",
    //           amount: chapter.coinValue,
    //           note: `Completed chapter: ${chapter.title}`,
    //         },
    //       });

    //       // Increment wallet balance
    //       await tx.wallet.update({
    //         where: { id: wallet.id },
    //         data: {
    //           balance: {
    //             increment: chapter.coinValue,
    //           },
    //         },
    //       });
    //     });

    //     coinsAwarded = chapter.coinValue;
    //   }
    // }

    res.json({
      success: true,
      data: {
        progress,
      },
      message: completed
        ? "Chapter marked as completed"
        : "Chapter marked as watched",
    });
  } catch (error) {
    console.error("Error marking chapter as watched:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark chapter as watched",
    });
  }
};

export const updateVideoProgress = async (
  req: AuthedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { chapterId } = req.params;
    const { currentTime, completed = false } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    console.log("currentTime", currentTime);
    console.log("completed", completed);

    if (!currentTime) {
      return res.status(400).json({
        success: false,
        message: "currentTime and completed is required",
      });
    }

    // Check if chapter exists and is published
    const chapter = await prisma.chapter.findFirst({
      where: {
        id: chapterId,
        isPublished: true,
      },
      include: {
        course: true,
      },
    });

    console.log("chapter", chapter);

    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: "Chapter not found",
      });
    }

    // Upsert progress record with current time
    const progress = await prisma.chapterProgress.upsert({
      where: {
        userId_chapterId: {
          userId,
          chapterId,
        },
      },
      update: {
        currentTime: Number(currentTime),

        watchedAt: new Date(),
      },
      create: {
        userId,
        chapterId,
        currentTime: Number(currentTime),

        watchedAt: new Date(),
      },
    });

    // Award coins if chapter is completed and has coin value
    let coinsAwarded = 0;
    if (completed && chapter.coinValue > 0) {
      // Check if this is the first time completing this chapter
      const existingProgress = await prisma.chapterProgress.findUnique({
        where: {
          userId_chapterId: {
            userId,
            chapterId,
          },
        },
      });

      console.log("existingProgress", existingProgress);

      if (!existingProgress?.completed) {
        // Award coins
        await prisma.user.update({
          where: { id: userId },
          data: {
            coinsEarned: {
              increment: chapter.coinValue,
            },
          },
        });

        // Use database transaction to ensure data consistency
        await prisma.$transaction(async (tx) => {
          // Get or create wallet for the user
          let wallet = await tx.wallet.findUnique({ where: { userId } });
          if (!wallet) {
            wallet = await tx.wallet.create({
              data: {
                userId,
                balance: 0,
              },
            });
          }

          // Add transaction record
          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              type: "EARNED",
              amount: chapter.coinValue,
              note: `Completed chapter: ${chapter.title}`,
            },
          });

          // Increment wallet balance
          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              balance: {
                increment: chapter.coinValue,
              },
            },
          });
        });

        coinsAwarded = chapter.coinValue;
      }
    }

    console.log("coinsAwarded", coinsAwarded);

    res.json({
      success: true,
      data: {
        progress: {
          id: progress.id,
          currentTime: progress.currentTime,
          completed: progress.completed,
          watchedAt: progress.watchedAt,
        },
        coinsAwarded,
      },
      message: completed
        ? "Chapter marked as completed"
        : "Video progress updated successfully",
    });
  } catch (error) {
    console.error("Error updating video progress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update video progress",
    });
  }
};

export const getUserCourseProgress = async (
  req: AuthedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { courseId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Get course with chapters
    const course = await prisma.course.findFirst({
      where: {
        id: courseId,
        isPublished: true,
      },
      include: {
        chapters: {
          where: { isPublished: true },
          include: {
            progress: {
              where: { userId },
            },
            quizzes: {
              where: { isPublished: true },
              include: {
                results: {
                  where: { userId },
                },
              },
            },
          },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Calculate progress
    const totalChapters = course.chapters.length;
    const completedChapters = course.chapters.filter(
      (chapter) => chapter.progress.length > 0 && chapter.progress[0].completed
    ).length;

    const progressPercentage =
      totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0;

    // Calculate quiz progress
    const totalQuizzes = course.chapters.reduce(
      (acc, chapter) => acc + chapter.quizzes.length,
      0
    );
    const completedQuizzes = course.chapters.reduce(
      (acc, chapter) =>
        acc +
        chapter.quizzes.filter(
          (quiz) => quiz.results.length > 0 && quiz.results[0].passed
        ).length,
      0
    );

    const quizProgressPercentage =
      totalQuizzes > 0 ? (completedQuizzes / totalQuizzes) * 100 : 0;

    // Calculate total coins from chapters and quizzes
    const totalCoinsFromChapters = course.chapters.reduce(
      (sum, chapter) => sum + (chapter.coinValue || 0),
      0
    );

    const totalCoinsFromQuizzes = course.chapters.reduce(
      (sum, chapter) =>
        sum +
        chapter.quizzes.reduce(
          (quizSum, quiz) => quizSum + (quiz.coinValue || 0),
          0
        ),
      0
    );

    const totalCoins = totalCoinsFromChapters + totalCoinsFromQuizzes;

    res.json({
      success: true,
      data: {
        course: {
          id: course.id,
          title: course.title,
          description: course.description,
          thumbnail: course.thumbnail,
          category: course.category,
          difficulty: course.difficulty,
          totalCoins, // Add total coins to course info
        },
        progress: {
          totalChapters,
          completedChapters,
          progressPercentage,
          totalQuizzes,
          completedQuizzes,
          quizProgressPercentage,
          totalCoins, // Add total coins to progress info as well
          chapters: course.chapters.map((chapter) => ({
            id: chapter.id,
            title: chapter.title,
            order: chapter.order,
            duration: chapter.duration,
            coinValue: chapter.coinValue,
            isCompleted:
              chapter.progress.length > 0 && chapter.progress[0].completed,
            watchedAt:
              chapter.progress.length > 0
                ? chapter.progress[0].watchedAt
                : null,
            quizzes: chapter.quizzes.map((quiz) => ({
              id: quiz.id,
              title: quiz.title,
              coinValue: quiz.coinValue,
              isCompleted: quiz.results.length > 0,
              isPassed: quiz.results.length > 0 && quiz.results[0].passed,
              score: quiz.results.length > 0 ? quiz.results[0].score : null,
            })),
          })),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching course progress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch course progress",
    });
  }
};

export const getRecentlyWatchedCourses = async (
  req: AuthedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { limit = 5 } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const recentProgress = await prisma.chapterProgress.findMany({
      where: {
        userId,
      },
      include: {
        chapter: {
          include: {
            course: {
              include: {
                chapters: {
                  where: { isPublished: true },
                  select: {
                    id: true,
                    title: true,
                    duration: true,
                    coinValue: true, // Add coinValue to chapters
                    quizzes: {
                      select: {
                        coinValue: true, // Add coinValue to quizzes
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        watchedAt: "desc",
      },
      take: Number(limit),
    });

    // Group by course and get the most recent chapter for each
    const courseMap = new Map();
    recentProgress.forEach((progress) => {
      const courseId = progress.chapter.course.id;
      if (
        !courseMap.has(courseId) ||
        (progress.watchedAt &&
          progress.watchedAt > courseMap.get(courseId).lastWatchedAt)
      ) {
        courseMap.set(courseId, {
          course: progress.chapter.course,
          lastWatchedChapter: progress.chapter,
          lastWatchedAt: progress.watchedAt,
          isCompleted: progress.completed,
        });
      }
    });

    const recentlyWatched = Array.from(courseMap.values())
      .map((item) => {
        // Calculate total coins for each course
        const totalCoinsFromChapters = item.course.chapters.reduce(
          (sum: number, chapter: any) => sum + (chapter.coinValue || 0),
          0
        );

        const totalCoinsFromQuizzes = item.course.chapters.reduce(
          (sum: number, chapter: any) =>
            sum +
            chapter.quizzes.reduce(
              (quizSum: number, quiz: any) => quizSum + (quiz.coinValue || 0),
              0
            ),
          0
        );

        const totalCoins = totalCoinsFromChapters + totalCoinsFromQuizzes;

        return {
          ...item,
          course: {
            ...item.course,
            totalCoins, // Add total coins to course
            chapters: item.course.chapters.map(
              ({ coinValue, ...chapter }: any) => ({
                ...chapter,
                quizzes: chapter.quizzes.map(
                  ({ coinValue: quizCoinValue, ...quiz }: any) => quiz
                ),
              })
            ),
          },
        };
      })
      .sort(
        (a, b) =>
          new Date(b.lastWatchedAt).getTime() -
          new Date(a.lastWatchedAt).getTime()
      );

    res.json({
      success: true,
      data: recentlyWatched,
    });
  } catch (error) {
    console.error("Error fetching recently watched courses:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch recently watched courses",
    });
  }
};

export const bookmarkCourse = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { courseId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Check if course exists
    const course = await prisma.course.findFirst({
      where: {
        id: courseId,
        isPublished: true,
      },
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // TODO: Implement bookmark functionality when Bookmark model is added
    // For now, return a placeholder response
    res.json({
      success: true,
      message:
        "Bookmark functionality will be implemented when Bookmark model is added to schema",
    });
  } catch (error) {
    console.error("Error bookmarking course:", error);
    res.status(500).json({
      success: false,
      message: "Failed to bookmark course",
    });
  }
};

export const unbookmarkCourse = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { courseId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // TODO: Implement unbookmark functionality when Bookmark model is added
    res.json({
      success: true,
      message:
        "Unbookmark functionality will be implemented when Bookmark model is added to schema",
    });
  } catch (error) {
    console.error("Error unbookmarking course:", error);
    res.status(500).json({
      success: false,
      message: "Failed to unbookmark course",
    });
  }
};

export const enrollInCourse = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { courseId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Check if course exists and is published
    const course = await prisma.course.findFirst({
      where: {
        id: courseId,
        isPublished: true,
      },
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found or not published",
      });
    }

    // Check if user is already enrolled
    const existingEnrollment = await prisma.enrolledCourse.findFirst({
      where: {
        userId,
        courseId,
      },
    });

    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        message: "User is already enrolled in this course",
      });
    }

    // Enroll user in the course
    const enrollment = await prisma.enrolledCourse.create({
      data: {
        userId,
        courseId,
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            description: true,
            thumbnail: true,
            category: true,
            difficulty: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      data: {
        enrollmentId: enrollment.id,
        course: enrollment.course,
        enrolledAt: enrollment.createdAt,
      },
      message: "Successfully enrolled in course",
    });
  } catch (error) {
    console.error("Error enrolling in course:", error);
    res.status(500).json({
      success: false,
      message: "Failed to enroll in course",
    });
  }
};

export const unenrollFromCourse = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { courseId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Check if user is enrolled in the course
    const enrollment = await prisma.enrolledCourse.findFirst({
      where: {
        userId,
        courseId,
      },
    });

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: "User is not enrolled in this course",
      });
    }

    // Remove enrollment
    await prisma.enrolledCourse.delete({
      where: {
        id: enrollment.id,
      },
    });

    res.json({
      success: true,
      message: "Successfully unenrolled from course",
    });
  } catch (error) {
    console.error("Error unenrolling from course:", error);
    res.status(500).json({
      success: false,
      message: "Failed to unenroll from course",
    });
  }
};

export const getChapterDetails = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { chapterId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Get the chapter with course details
    const chapter = await prisma.chapter.findFirst({
      where: {
        id: chapterId,
        isPublished: true,
      },
      include: {
        course: {
          include: {
            chapters: {
              where: { isPublished: true },
              select: {
                id: true,
                title: true,
                order: true,
              },
              orderBy: { order: "asc" },
            },
          },
        },
        documents: true,
        quizzes: {
          include: {
            questions: {
              include: {
                options: true,
              },
            },
          },
        },
        summary : true
      },
    });

    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: "Chapter not found",
      });
    }

    // Check if user is enrolled in the course
    const enrollment = await prisma.enrolledCourse.findFirst({
      where: {
        userId,
        courseId: chapter.courseId,
      },
    });

    console.log("enrollment", enrollment);

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "You must enroll in this course to access chapters",
      });
    }

    // Get all chapters in the course ordered by sequence
    const courseChapters = chapter.course.chapters;
    const currentChapterIndex = courseChapters.findIndex(
      (ch) => ch.id === chapterId
    );

    if (currentChapterIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Chapter not found in course",
      });
    }

    // If this is not the first chapter, check if previous chapters are completed
    let previousChapters: any[] = [];
    if (currentChapterIndex > 0) {
      previousChapters = courseChapters.slice(0, currentChapterIndex);
      const previousChapterIds = previousChapters.map((ch) => ch.id);

      // Get user's progress for previous chapters
      const previousProgress = await prisma.chapterProgress.findMany({
        where: {
          userId,
          chapterId: {
            in: previousChapterIds,
          },
          completed: true,
        },
      });

      // Check if all previous chapters are completed
      const completedPreviousChapters = previousProgress.length;
      const requiredPreviousChapters = previousChapters.length;

      if (completedPreviousChapters < requiredPreviousChapters) {
        const nextIncompleteChapter = previousChapters.find(
          (ch) =>
            !previousProgress.some((progress) => progress.chapterId === ch.id)
        );

        return res.status(403).json({
          success: false,
          message: `You must complete "${nextIncompleteChapter?.title}" before accessing this chapter`,
          requiredChapter: {
            id: nextIncompleteChapter?.id,
            title: nextIncompleteChapter?.title,
            order: nextIncompleteChapter?.order,
          },
        });
      }
    }

    // Get user's progress for this chapter
    const userProgress = await prisma.chapterProgress.findUnique({
      where: {
        userId_chapterId: {
          userId,
          chapterId,
        },
      },
    });

    // Get user's quiz results for this chapter
    const quizResults = await prisma.quizResult.findMany({
      where: {
        userId,
        quiz: {
          chapterId,
        },
      },
      select: {
        quizId: true,
        score: true,
        passed: true,
        attemptedAt: true,
      },
    });

    res.json({
      success: true,
      data: {
        chapter: {
          id: chapter.id,
          title: chapter.title,
          description: chapter.description,
          videoUrl: chapter.videoUrl,
          muxPlaybackId: chapter.muxPlaybackId,
          duration: chapter.duration,
          order: chapter.order,
          coinValue: chapter.coinValue,
          documents: chapter.documents,
          isCompleted: userProgress ? userProgress.completed : false,
          quizzes: chapter.quizzes.map((quiz) => ({
            ...quiz,
            userResult:
              quizResults.find((result) => result.quizId === quiz.id) || null,
          })),
          summary: chapter.summary,
        },
        course: {
          id: chapter.course.id,
          title: chapter.course.title,
          category: chapter.course.category,
          difficulty: chapter.course.difficulty,
        },
        userProgress: userProgress
          ? {
              currentTime: userProgress.currentTime,
              completed: userProgress.completed,
              watchedAt: userProgress.watchedAt,
            }
          : {
              currentTime: 0,
              completed: false,
              watchedAt: null,
            },
        prerequisites: {
          isFirstChapter: currentChapterIndex === 0,
          previousChaptersRequired: currentChapterIndex,
          previousChaptersCompleted:
            currentChapterIndex > 0 ? previousChapters.length : 0,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching chapter details:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch chapter details",
    });
  }
};
