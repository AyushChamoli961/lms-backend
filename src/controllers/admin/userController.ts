import { Router, Request, Response } from "express";
import { db } from "../../helper/db";

const router = Router();

router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const currentYear = new Date().getFullYear();

    // Get dashboard stats
    const [
      totalUsers,
      activeCourses,
      totalCoinsEarned,
      totalEnrollments,
      totalChaptersWatched,
      totalQuizzesPassed,
    ] = await Promise.all([
      // Total users count
      db.user.count(),

      // Active (published) courses count
      db.course.count({
        where: { isPublished: true },
      }),

      // Total coins earned by all users
      db.user.aggregate({
        _sum: {
          coinsEarned: true,
        },
      }),

      // Total enrollments
      db.enrolledCourse.count(),

      // Total completed chapters (as a proxy for engagement)
      db.chapterProgress.count({
        where: { completed: true },
      }),

      // Total passed quizzes
      db.quizResult.count({
        where: { passed: true },
      }),
    ]);

    // Get monthly user registration data for the current year
    const monthlyUserData = await db.user.groupBy({
      by: ["createdAt"],
      where: {
        createdAt: {
          gte: new Date(`${currentYear}-01-01`),
          lte: new Date(`${currentYear}-12-31`),
        },
      },
      _count: {
        id: true,
      },
    });

    // Process monthly data into chart format
    const monthlyStats = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const monthName = new Date(currentYear, index).toLocaleDateString(
        "en-US",
        { month: "short" }
      );

      // Count users registered in this month
      const usersInMonth = monthlyUserData
        .filter((data) => {
          const createdMonth = new Date(data.createdAt).getMonth() + 1;
          return createdMonth === month;
        })
        .reduce((sum, data) => sum + data._count.id, 0);

      return {
        month: monthName,
        users: usersInMonth,
        monthNumber: month,
      };
    });

    // Get additional stats for better dashboard insights
    const [
      verifiedUsers,
      unverifiedUsers,
      superAdmins,
      l1Admins,
      l2Admins,
      totalTransactions,
      totalWallets,
    ] = await Promise.all([
      db.user.count({ where: { isVerified: true } }),
      db.user.count({ where: { isVerified: false } }),
      db.user.count({ where: { role: "SUPER_ADMIN" } }),
      db.user.count({ where: { role: "L1_ADMIN" } }),
      db.user.count({ where: { role: "L2_ADMIN" } }),
      db.transaction.count(),
      db.wallet.count(),
    ]);

    // Get recent user registrations (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentUsers = await db.user.count({
      where: {
        createdAt: {
          gte: sevenDaysAgo,
        },
      },
    });

    // Calculate engagement metrics
    const totalUsers_nonZero = totalUsers > 0 ? totalUsers : 1; // Prevent division by zero
    const engagementRate =
      totalEnrollments > 0
        ? ((totalChaptersWatched / totalEnrollments) * 100).toFixed(2)
        : "0.00";

    // Get course category distribution
    const coursesByCategory = await db.course.groupBy({
      by: ["category"],
      where: { isPublished: true },
      _count: {
        id: true,
      },
    });

    res.json({
      success: true,
      message: "Dashboard data fetched successfully",
      data: {
        stats: {
          totalUsers,
          activeCourses,
          totalCoinsEarned: totalCoinsEarned._sum.coinsEarned || 0,
          totalEnrollments,
          totalChaptersWatched,
          totalQuizzesPassed,
          engagementRate: `${engagementRate}%`,
          verifiedUsers,
          unverifiedUsers,
          adminUsers: {
            superAdmins,
            l1Admins,
            l2Admins,
            total: superAdmins + l1Admins + l2Admins,
          },
          recentUsers,
          totalTransactions,
          totalWallets,
        },
        monthlyUserData: monthlyStats,
        coursesByCategory: coursesByCategory.map((cat) => ({
          category: cat.category,
          count: cat._count.id,
        })),
        year: currentYear,
      },
    });
  } catch (error) {
    console.error("Get dashboard data error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching dashboard data",
    });
  }
});

// Get all users
router.get("/users", async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, search, role, isVerified } = req.query;

    // Build where clause for filtering
    const whereClause: any = {};

    if (search) {
      whereClause.OR = [
        { email: { contains: search as string, mode: "insensitive" } },
        { name: { contains: search as string, mode: "insensitive" } },
      ];
    }

    if (role) {
      whereClause.role = role as string;
    }

    if (isVerified !== undefined) {
      whereClause.isVerified = isVerified === "true";
    }

    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Fetch users with pagination
    const [users, totalCount] = await Promise.all([
      db.user.findMany({
        where: whereClause,
        include: {
          enrolledCourses: {
            select: {
              id: true,
            },
          },
          wallet: {
            select: {
              balance: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take,
      }),
      db.user.count({ where: whereClause }),
    ]);

    // Transform the data to include counts
    const usersWithStats = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      isVerified: user.isVerified,
      role: user.role,
      coinsEarned: user.coinsEarned,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      enrolledCoursesCount: user.enrolledCourses.length,
      walletBalance: user.wallet?.balance || 0,
    }));

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / take);
    const hasNextPage = Number(page) < totalPages;
    const hasPreviousPage = Number(page) > 1;

    res.json({
      success: true,
      message: "Users fetched successfully",
      data: {
        users: usersWithStats,
        pagination: {
          currentPage: Number(page),
          totalPages,
          totalCount,
          hasNextPage,
          hasPreviousPage,
          limit: take,
        },
      },
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching users",
    });
  }
});

router.get("/learners", async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, search, isVerified } = req.query;

    // Build where clause for filtering
    const whereClause: any = {};

    if (search) {
      whereClause.OR = [
        { email: { contains: search as string, mode: "insensitive" } },
        { name: { contains: search as string, mode: "insensitive" } },
      ];
    }

    whereClause.role = "USER"; // Only fetch learners

    if (isVerified !== undefined) {
      whereClause.isVerified = isVerified === "true";
    }

    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Fetch users with pagination
    const [users, totalCount] = await Promise.all([
      db.user.findMany({
        where: whereClause,
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
          enrolledCourses: {
            select: {
              id: true,
            },
          },
          wallet: {
            select: {
              balance: true,
            },
          },
        },

        orderBy: {
          createdAt: "desc",
        },
        skip,
        take,
      }),
      db.user.count({ where: whereClause }),
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / take);
    const hasNextPage = Number(page) < totalPages;
    const hasPreviousPage = Number(page) > 1;

    res.json({
      success: true,
      message: "Users fetched successfully",
      data: {
        users,
        pagination: {
          currentPage: Number(page),
          totalPages,
          totalCount,
          hasNextPage,
          hasPreviousPage,
          limit: take,
        },
      },
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching users",
    });
  }
});

// Get user by ID
router.get("/users/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await db.user.findUnique({
      where: { id },
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
        chaptersWatched: {
          select: {
            id: true,
            chapter: {
              select: {
                id: true,
                title: true,
              },
            },
            completed: true,
          },
        },

        enrolledCourses: {
          select: {
            id: true,
            course: true,
          },
        },
        wallet: {
          select: {
            balance: true,
            transactions: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: "User fetched successfully",
      data: { user },
    });
  } catch (error) {
    console.error("Get user by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching user",
    });
  }
});

// Update user status (verify/unverify)
router.patch("/users/:id/status", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isVerified } = req.body;

    if (typeof isVerified !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isVerified must be a boolean value",
      });
    }

    const updatedUser = await db.user.update({
      where: { id },
      data: { isVerified },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isVerified: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      message: `User ${isVerified ? "verified" : "unverified"} successfully`,
      data: { user: updatedUser },
    });
  } catch (error) {
    console.error("Update user status error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while updating user status",
    });
  }
});

// Delete user
router.delete("/users/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const existingUser = await db.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true },
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await db.user.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: "User deleted successfully",
      data: { deletedUser: existingUser },
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while deleting user",
    });
  }
});

export { router as userController };
