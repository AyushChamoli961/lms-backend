import { Router, Request, Response } from "express";
import { db } from "../../helper/db";

const router = Router();

router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const currentYear = new Date().getFullYear();

    // Get dashboard stats with organization focus
    const [
      totalUsers,
      totalOrganizations,
      activeOrganizations,
      totalEmployees,
      activeCourses,
      totalEnrollments,
      totalChaptersWatched,
      totalQuizzesPassed,
      activeSubscriptions,
      expiredSubscriptions,
      totalInvitations,
      pendingInvitations,
    ] = await Promise.all([
      // Total users count
      db.user.count(),

      // Total organizations
      db.organization.count(),

      // Active organizations
      db.organization.count({
        where: { isActive: true },
      }),

      // Total organization employees
      db.organizationUser.count({
        where: { status: "ACTIVE" },
      }),

      // Active (published) courses count
      db.course.count({
        where: { isPublished: true },
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

      // Active subscriptions
      db.subscription.count({
        where: { status: "ACTIVE" },
      }),

      // Expired subscriptions
      db.subscription.count({
        where: { status: "EXPIRED" },
      }),

      // Total invitations sent
      db.invitation.count(),

      // Pending invitations
      db.invitation.count({
        where: {
          isAccepted: false,
          expiresAt: {
            gt: new Date(),
          },
        },
      }),
    ]);

    // Get monthly organization registration data for the current year
    const monthlyOrgData = await db.organization.groupBy({
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

    // Process monthly organization data into chart format
    const monthlyOrgStats = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const monthName = new Date(currentYear, index).toLocaleDateString(
        "en-US",
        { month: "short" }
      );

      // Count organizations registered in this month
      const orgsInMonth = monthlyOrgData
        .filter((data) => {
          const createdMonth = new Date(data.createdAt).getMonth() + 1;
          return createdMonth === month;
        })
        .reduce((sum, data) => sum + data._count.id, 0);

      return {
        month: monthName,
        organizations: orgsInMonth,
        monthNumber: month,
      };
    });

    // Get additional organization-focused stats
    const [
      verifiedUsers,
      unverifiedUsers,
      superAdmins,
      l1Admins,
      l2Admins,
      orgAdmins,
      orgEmployees,
      totalTransactions,
    ] = await Promise.all([
      db.user.count({ where: { isVerified: true } }),
      db.user.count({ where: { isVerified: false } }),
      db.user.count({ where: { role: "SUPER_ADMIN" } }),
      db.user.count({ where: { role: "L1_ADMIN" } }),
      db.user.count({ where: { role: "L2_ADMIN" } }),
      db.user.count({ where: { role: "ORG_ADMIN" } }),
      db.user.count({ where: { role: "ORG_EMPLOYEE" } }),
      db.transaction.count(),
    ]);

    // Get organization insights
    const [organizationsByStatus, employeesByStatus] = await Promise.all([
      // Organizations by status
      db.organization.groupBy({
        by: ["isActive"],
        _count: {
          id: true,
        },
      }),

      // Employees by status
      db.organizationUser.groupBy({
        by: ["status"],
        _count: {
          id: true,
        },
      }),
    ]);

    // Get active subscriptions with plan details (FIXED - no include in groupBy)
    const activeSubscriptionsWithPlans = await db.subscription.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        planId: true,
        plan: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    });

    // Group subscriptions by plan manually
    const subscriptionsByPlan = activeSubscriptionsWithPlans.reduce(
      (acc, subscription) => {
        const planId = subscription.planId;
        const existing = acc.find((item) => item.planId === planId);

        if (existing) {
          existing.count += 1;
        } else {
          acc.push({
            planId,
            planName: subscription.plan?.name || "Unknown Plan",
            planType: subscription.plan?.type || "UNKNOWN",
            count: 1,
          });
        }

        return acc;
      },
      [] as Array<{
        planId: string;
        planName: string;
        planType: string;
        count: number;
      }>
    );

    // Get recent organization registrations (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentOrganizations = await db.organization.count({
      where: {
        createdAt: {
          gte: sevenDaysAgo,
        },
      },
    });

    // Calculate engagement metrics
    const totalEmployees_nonZero = totalEmployees > 0 ? totalEmployees : 1;
    const employeeEngagementRate =
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

    // Get top organizations by employee count
    const topOrganizations = await db.organization.findMany({
      where: { isActive: true },
      include: {
        employees: {
          where: { status: "ACTIVE" },
          select: { id: true },
        },
        currentPlan: {
          select: {
            plan: {
              select: {
                name: true,
                type: true,
              },
            },
          },
        },
      },
      orderBy: {
        employees: {
          _count: "desc",
        },
      },
      take: 5,
    });

    res.json({
      success: true,
      message: "Dashboard data fetched successfully",
      data: {
        stats: {
          // User stats
          totalUsers,
          verifiedUsers,
          unverifiedUsers,

          // Organization stats
          totalOrganizations,
          activeOrganizations,
          recentOrganizations,

          // Employee stats
          totalEmployees,
          orgAdmins,
          orgEmployees,
          employeeEngagementRate: `${employeeEngagementRate}%`,

          // Course and learning stats
          activeCourses,
          totalEnrollments,
          totalChaptersWatched,
          totalQuizzesPassed,

          // Subscription stats
          activeSubscriptions,
          expiredSubscriptions,

          // Invitation stats
          totalInvitations,
          pendingInvitations,

          // Admin stats
          adminUsers: {
            superAdmins,
            l1Admins,
            l2Admins,
            total: superAdmins + l1Admins + l2Admins,
          },

          // Transaction stats
          totalTransactions,
        },
        monthlyOrgData: monthlyOrgStats,
        coursesByCategory: coursesByCategory.map((cat) => ({
          category: cat.category,
          count: cat._count.id,
        })),
        organizationInsights: {
          organizationsByStatus: organizationsByStatus.map((status) => ({
            status: status.isActive ? "Active" : "Inactive",
            count: status._count.id,
          })),
          subscriptionsByPlan: subscriptionsByPlan.map((sub) => ({
            planId: sub.planId,
            planName: sub.planName,
            planType: sub.planType,
            count: sub.count,
          })),
          employeesByStatus: employeesByStatus.map((emp) => ({
            status: emp.status,
            count: emp._count.id,
          })),
        },
        topOrganizations: topOrganizations.map((org) => ({
          id: org.id,
          name: org.name,
          email: org.email,
          employeeCount: org.employees.length,
          currentPlan: org.currentPlan?.plan?.name || "No Plan",
          planType: org.currentPlan?.plan?.type || "NONE",
          isActive: org.isActive,
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
          organizationMembership: {
            include: {
              organization: {
                select: {
                  id: true,
                  name: true,
                },
              },
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

    // Transform the data to include counts and organization info
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
      organization: user.organizationMembership?.organization || null,
      organizationStatus: user.organizationMembership?.status || null,
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

    whereClause.role = "ORG_EMPLOYEE"; // Only fetch learners

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
          organizationMembership: {
            select: {
              id: true,
              role: true,
              status: true,
              joinedAt: true,
              organization: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  isActive: true,
                  currentPlan: {
                    select: {
                      plan: {
                        select: {
                          name: true,
                          type: true,
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
        organizationMembership: {
          include: {
            organization: true,
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
