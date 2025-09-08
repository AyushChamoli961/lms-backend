import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthedRequest } from "../../middleware/admin";

const prisma = new PrismaClient();

// Get user profile
export const getUserProfile = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Get user profile with related data
    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        wallet: {
          include: {
            transactions: {
              orderBy: { createdAt: "desc" },
              take: 10, // Get last 10 transactions
            },
          },
        },
        chaptersWatched: {
          include: {
            chapter: {
              select: {
                id: true,
                title: true,
                duration: true,
                course: {
                  select: {
                    id: true,
                    title: true,
                    thumbnail: true,
                  },
                },
              },
            },
          },
          orderBy: { watchedAt: "desc" },
          take: 10, // Get last 10 watched chapters
        },
        quizResults: {
          include: {
            quiz: {
              select: {
                id: true,
                title: true,
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
            },
          },
          orderBy: { attemptedAt: "desc" },
          take: 10, // Get last 10 quiz results
        },
        enrolledCourses: {
          include: {
            course: {
              select: {
                id: true,
                title: true,
                description: true,
                thumbnail: true,
                category: true,
                difficulty: true,
                estimatedDuration: true,
                chapters: {
                  where: { isPublished: true },
                  select: {
                    id: true,
                    title: true,
                    duration: true,
                    coinValue: true,
                  },
                  orderBy: { order: "asc" },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        notifications: {
          orderBy: { createdAt: "desc" },
          take: 20, // Get last 20 notifications
        },
      },
    });

    if (!userProfile) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    // Calculate additional statistics
    const totalChaptersWatched = userProfile.chaptersWatched.length;
    const completedChapters = userProfile.chaptersWatched.filter(
      (progress) => progress.completed
    ).length;

    const totalQuizzesAttempted = userProfile.quizResults.length;
    const passedQuizzes = userProfile.quizResults.filter(
      (result) => result.passed
    ).length;

    const totalCoursesEnrolled = userProfile.enrolledCourses.length;

    // Calculate total watch time
    const totalWatchTime = userProfile.chaptersWatched.reduce(
      (total, progress) => total + (progress.chapter.duration || 0),
      0
    );

    // Calculate total coins earned from transactions
    const totalCoinsEarned =
      userProfile.wallet?.transactions
        .filter((transaction) => transaction.type === "EARNED")
        .reduce((total, transaction) => total + transaction.amount, 0) || 0;

    const totalCoinsRedeemed =
      userProfile.wallet?.transactions
        .filter((transaction) => transaction.type === "REDEEMED")
        .reduce((total, transaction) => total + transaction.amount, 0) || 0;

    // Format the response
    const profileData = {
      id: userProfile.id,
      name: userProfile.name,
      email: userProfile.email,
      phone: userProfile.phone,
      isVerified: userProfile.isVerified,
      role: userProfile.role,
      coinsEarned: userProfile.coinsEarned,
      createdAt: userProfile.createdAt,
      updatedAt: userProfile.updatedAt,

      // Wallet information
      wallet: {
        balance: userProfile.wallet?.balance || 0,
        recentTransactions: userProfile.wallet?.transactions || [],
      },

      // Statistics
      statistics: {
        totalChaptersWatched,
        completedChapters,
        totalQuizzesAttempted,
        passedQuizzes,
        totalCoursesEnrolled,
        totalWatchTime, // in minutes
        totalCoinsEarned,
        totalCoinsRedeemed,
        successRate:
          totalQuizzesAttempted > 0
            ? Math.round((passedQuizzes / totalQuizzesAttempted) * 100)
            : 0,
      },

      // Recent activity
      recentActivity: {
        watchedChapters: userProfile.chaptersWatched,
        quizResults: userProfile.quizResults,
        notifications: userProfile.notifications,
      },

      // Enrolled courses
      enrolledCourses: userProfile.enrolledCourses,
    };

    res.json({
      success: true,
      data: profileData,
      message: "Profile retrieved successfully",
    });
  } catch (error) {
    console.error("Error getting user profile:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user profile",
    });
  }
};

// Update user profile
export const updateUserProfile = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, email, phone } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Validate input
    if (!name && !email && !phone) {
      return res.status(400).json({
        success: false,
        message: "At least one field (name, email, or phone) is required",
      });
    }

    // Check if email is already taken by another user
    if (email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email,
          id: { not: userId },
        },
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email is already taken by another user",
        });
      }
    }

    // Check if phone is already taken by another user
    if (phone) {
      const existingUser = await prisma.user.findFirst({
        where: {
          phone,
          id: { not: userId },
        },
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Phone number is already taken by another user",
        });
      }
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(phone && { phone }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isVerified: true,
        role: true,
        coinsEarned: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      data: updatedUser,
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("Error updating user profile:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update user profile",
    });
  }
};

// Get user statistics
export const getUserStatistics = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Get user statistics
    const [
      totalChaptersWatched,
      completedChapters,
      totalQuizzesAttempted,
      passedQuizzes,
      totalCoursesEnrolled,
      totalCoinsEarned,
      totalCoinsRedeemed,
      walletBalance,
    ] = await Promise.all([
      // Total chapters watched
      prisma.chapterProgress.count({
        where: { userId },
      }),

      // Completed chapters
      prisma.chapterProgress.count({
        where: { userId, completed: true },
      }),

      // Total quizzes attempted
      prisma.quizResult.count({
        where: { userId },
      }),

      // Passed quizzes
      prisma.quizResult.count({
        where: { userId, passed: true },
      }),

      // Total courses enrolled
      prisma.enrolledCourse.count({
        where: { userId },
      }),

      // Total coins earned
      prisma.transaction.aggregate({
        where: {
          wallet: { userId },
          type: "EARNED",
        },
        _sum: { amount: true },
      }),

      // Total coins redeemed
      prisma.transaction.aggregate({
        where: {
          wallet: { userId },
          type: "REDEEMED",
        },
        _sum: { amount: true },
      }),

      // Wallet balance
      prisma.wallet.findUnique({
        where: { userId },
        select: { balance: true },
      }),
    ]);

    const statistics = {
      totalChaptersWatched,
      completedChapters,
      totalQuizzesAttempted,
      passedQuizzes,
      totalCoursesEnrolled,
      totalCoinsEarned: totalCoinsEarned._sum.amount || 0,
      totalCoinsRedeemed: totalCoinsRedeemed._sum.amount || 0,
      walletBalance: walletBalance?.balance || 0,
      successRate:
        totalQuizzesAttempted > 0
          ? Math.round((passedQuizzes / totalQuizzesAttempted) * 100)
          : 0,
      completionRate:
        totalChaptersWatched > 0
          ? Math.round((completedChapters / totalChaptersWatched) * 100)
          : 0,
    };

    res.json({
      success: true,
      data: statistics,
      message: "Statistics retrieved successfully",
    });
  } catch (error) {
    console.error("Error getting user statistics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user statistics",
    });
  }
};
