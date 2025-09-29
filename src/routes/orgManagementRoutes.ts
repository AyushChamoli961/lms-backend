import { Router, Response } from "express";
import { db } from "../helper/db";
import bcrypt from "bcrypt";
import { Role, PlanStatus, EmployeeStatus } from "@prisma/client";
import {
  AuthedRequest,
  requireAdmin,
  requireSuperAdmin,
} from "../middleware/admin";

const router = Router();

// Get all organizations (Super Admin only) - OPTIMIZED
router.get("/", requireAdmin(), async (req: AuthedRequest, res: Response) => {
  try {
    console.log("Starting organizations fetch..."); // Debug log

    const { page = 1, limit = 10, search, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { email: { contains: search as string, mode: "insensitive" } },
      ];
    }

    if (status !== undefined) {
      where.isActive = status === "active";
    }

    console.log("Where clause:", JSON.stringify(where)); // Debug log

    // FIXED: Simplified query with timeout protection
    const queryPromise = db.organization.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        website: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // Simplified plan selection
        currentPlan: {
          select: {
            id: true,
            status: true,
            employeeLimit: true,
            employeeCount: true,
            startDate: true,
            endDate: true,
            plan: {
              select: {
                id: true,
                name: true,
                type: true,
                maxEmployees: true,
              },
            },
          },
        },
        // Use _count for efficient counting with explicit where clauses
        _count: {
          select: {
            employees: {
              where: { status: EmployeeStatus.ACTIVE },
            },
            subscriptions: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    });

    // FIXED: Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Database query timeout")), 30000); // 30 second timeout
    });

    const organizations = (await Promise.race([
      queryPromise,
      timeoutPromise,
    ])) as any[];

    console.log(`Found ${organizations.length} organizations`); // Debug log

    // FIXED: Get total count with timeout protection
    const countPromise = db.organization.count({ where });
    const countTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Count query timeout")), 10000); // 10 second timeout
    });

    const totalCount = (await Promise.race([
      countPromise,
      countTimeoutPromise,
    ])) as number;

    console.log(`Total count: ${totalCount}`); // Debug log

    // FIXED: Simplified admin user fetching with error handling
    let adminUserMap = new Map();

    try {
      if (organizations.length > 0) {
        const orgIds = organizations.map((org) => org.id);
        const adminUsers = await db.organizationUser.findMany({
          where: {
            organizationId: { in: orgIds },
            role: Role.ORG_ADMIN,
            status: EmployeeStatus.ACTIVE,
          },
          select: {
            organizationId: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
        });

        // Create a map for quick lookup
        adminUsers.forEach((admin) => {
          adminUserMap.set(admin.organizationId, admin.user);
        });
      }
    } catch (adminError) {
      console.error("Error fetching admin users:", adminError);
      // Continue without admin data rather than failing completely
    }

    // Transform organizations with error handling
    const organizationsWithStats = organizations.map((org) => {
      try {
        return {
          id: org.id,
          name: org.name,
          email: org.email,
          phone: org.phone,
          address: org.address,
          website: org.website,
          isActive: org.isActive,
          createdAt: org.createdAt,
          updatedAt: org.updatedAt,
          currentPlan: org.currentPlan
            ? {
                id: org.currentPlan.id,
                planName: org.currentPlan.plan?.name || "Unknown Plan",
                planType: org.currentPlan.plan?.type || "BASIC",
                status: org.currentPlan.status,
                employeeLimit: org.currentPlan.employeeLimit,
                employeeCount: org.currentPlan.employeeCount,
                startDate: org.currentPlan.startDate,
                endDate: org.currentPlan.endDate,
              }
            : null,
          stats: {
            totalEmployees: org._count?.employees || 0,
            totalSubscriptions: org._count?.subscriptions || 0,
            adminUser: adminUserMap.get(org.id) || null,
          },
        };
      } catch (transformError) {
        console.error(
          `Error transforming organization ${org.id}:`,
          transformError
        );
        // Return minimal data rather than failing
        return {
          id: org.id,
          name: org.name || "Unknown",
          email: org.email || "Unknown",
          phone: org.phone,
          address: org.address,
          website: org.website,
          isActive: org.isActive,
          createdAt: org.createdAt,
          updatedAt: org.updatedAt,
          currentPlan: null,
          stats: {
            totalEmployees: 0,
            totalSubscriptions: 0,
            adminUser: null,
          },
        };
      }
    });

    console.log("Sending response..."); // Debug log

    res.json({
      success: true,
      data: {
        organizations: organizationsWithStats,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(totalCount / Number(limit)),
          totalCount,
          hasNext: skip + Number(limit) < totalCount,
          hasPrev: Number(page) > 1,
        },
      },
    });
  } catch (error) {
    console.error("Get organizations error:", error);

    // FIXED: More detailed error response
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    res.status(500).json({
      success: false,
      message: "Error fetching organizations",
      error: process.env.NODE_ENV === "development" ? errorMessage : undefined,
    });
  }
});

// Get organization details (Admin) - OPTIMIZED
router.get(
  "/:id",
  requireAdmin(),
  async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;

      // OPTIMIZATION: Use parallel queries and selective field loading
      const [organization, employeePerformanceData] = await Promise.all([
        // Main organization data with selective includes
        db.organization.findUnique({
          where: { id },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
            website: true,
            logo: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
            currentPlan: {
              select: {
                id: true,
                status: true,
                employeeLimit: true,
                employeeCount: true,
                startDate: true,
                endDate: true,
                plan: true,
              },
            },
            subscriptions: {
              select: {
                id: true,
                status: true,
                startDate: true,
                endDate: true,
                employeeLimit: true,
                employeeCount: true,
                createdAt: true,
                plan: {
                  select: {
                    id: true,
                    name: true,
                    type: true,
                  },
                },
              },
              orderBy: { createdAt: "desc" },
            },
            employees: {
              select: {
                id: true,
                role: true,
                status: true,
                joinedAt: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    role: true,
                    coinsEarned: true,
                    createdAt: true,
                  },
                },
              },
              orderBy: { joinedAt: "desc" },
            },
            invitations: {
              where: {
                isAccepted: false,
                expiresAt: { gt: new Date() },
              },
              select: {
                id: true,
                email: true,
                role: true,
                createdAt: true,
                expiresAt: true,
                invitedBy: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
              orderBy: { createdAt: "desc" },
            },
          },
        }),
        // Performance data in separate optimized query
        getEmployeePerformanceData(id),
      ]);

      if (!organization) {
        return res.status(404).json({
          success: false,
          message: "Organization not found",
        });
      }

      // Merge performance data with employee data
      const employeesWithPerformance = organization.employees.map((emp) => ({
        ...emp,
        performance: employeePerformanceData.get(emp.user.id) || {
          coursesEnrolled: 0,
          chaptersCompleted: 0,
          quizzesAttempted: 0,
          quizzesPassed: 0,
          averageQuizScore: 0,
        },
      }));

      const stats = {
        totalEmployees: organization.employees.length,
        activeEmployees: organization.employees.filter(
          (emp) => emp.status === EmployeeStatus.ACTIVE
        ).length,
        pendingInvitations: organization.invitations.length,
        totalEnrollments: Array.from(employeePerformanceData.values()).reduce(
          (sum, perf) => sum + perf.coursesEnrolled,
          0
        ),
        totalCoinsEarned: organization.employees.reduce(
          (sum, emp) => sum + emp.user.coinsEarned,
          0
        ),
      };

      res.json({
        success: true,
        data: {
          ...organization,
          employees: employeesWithPerformance,
          stats,
        },
      });
    } catch (error) {
      console.error("Get organization details error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching organization details",
      });
    }
  }
);

// Helper function to get employee performance data efficiently
async function getEmployeePerformanceData(organizationId: string) {
  try {
    const employees = await db.organizationUser.findMany({
      where: { organizationId },
      select: { userId: true },
    });

    const employeeIds = employees.map((emp) => emp.userId);

    if (employeeIds.length === 0) {
      return new Map();
    }

    const [enrolledCourses, chaptersProgress, quizResults] = await Promise.all([
      db.enrolledCourse.findMany({
        where: { userId: { in: employeeIds } },
        select: { userId: true, courseId: true },
      }),
      db.chapterProgress.findMany({
        where: {
          userId: { in: employeeIds },
          completed: true,
        },
        select: { userId: true },
      }),
      db.quizResult.findMany({
        where: { userId: { in: employeeIds } },
        select: { userId: true, score: true, passed: true },
      }),
    ]);

    // Create performance map
    const performanceMap = new Map();

    employeeIds.forEach((userId) => {
      const userEnrollments = enrolledCourses.filter(
        (e) => e.userId === userId
      );
      const userProgress = chaptersProgress.filter((p) => p.userId === userId);
      const userQuizzes = quizResults.filter((q) => q.userId === userId);
      const userPassedQuizzes = userQuizzes.filter((q) => q.passed);

      performanceMap.set(userId, {
        coursesEnrolled: userEnrollments.length,
        chaptersCompleted: userProgress.length,
        quizzesAttempted: userQuizzes.length,
        quizzesPassed: userPassedQuizzes.length,
        averageQuizScore:
          userQuizzes.length > 0
            ? Math.round(
                userQuizzes.reduce((sum, q) => sum + q.score, 0) /
                  userQuizzes.length
              )
            : 0,
      });
    });

    return performanceMap;
  } catch (error) {
    console.error("Error getting employee performance data:", error);
    return new Map();
  }
}

// Create organization (Super Admin only) - OPTIMIZED
router.post("/", requireAdmin(), async (req: AuthedRequest, res: Response) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      website,
      adminName,
      adminEmail,
      adminPhone,
      password,
      planId,
    } = req.body;

    // Validate required fields
    if (!name || !email || !adminName || !adminEmail || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Organization name, email, admin name, admin email, and password are required",
      });
    }

    // OPTIMIZATION: Check existence in parallel
    const [existingOrg, existingAdmin, plan] = await Promise.all([
      db.organization.findUnique({
        where: { email },
        select: { id: true },
      }),
      db.user.findUnique({
        where: { email: adminEmail },
        select: { id: true },
      }),
      planId
        ? db.plan.findUnique({
            where: { id: planId, isActive: true },
            select: { id: true, maxEmployees: true, billingCycle: true },
          })
        : Promise.resolve(null),
    ]);

    if (existingOrg) {
      return res.status(400).json({
        success: false,
        message: "Organization already exists with this email",
      });
    }

    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this admin email",
      });
    }

    if (planId && !plan) {
      return res.status(400).json({
        success: false,
        message: "Invalid or inactive plan selected",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create organization and admin user in transaction
    const result = await db.$transaction(async (tx) => {
      // Create organization
      const organization = await tx.organization.create({
        data: {
          name,
          email,
          phone,
          address,
          website,
          isActive: true,
        },
      });

      // Create admin user
      const adminUser = await tx.user.create({
        data: {
          name: adminName,
          email: adminEmail,
          phone: adminPhone,
          password: hashedPassword,
          role: Role.ORG_ADMIN,
          isVerified: true,
        },
      });

      // Link admin to organization
      await tx.organizationUser.create({
        data: {
          organizationId: organization.id,
          userId: adminUser.id,
          role: Role.ORG_ADMIN,
          status: EmployeeStatus.ACTIVE,
        },
      });

      // Create subscription if plan is provided
      let subscription = null;
      if (plan) {
        const startDate = new Date();
        const endDate = new Date(startDate);
        if (plan.billingCycle === "yearly") {
          endDate.setFullYear(endDate.getFullYear() + 1);
        } else {
          endDate.setMonth(endDate.getMonth() + 1);
        }

        subscription = await tx.subscription.create({
          data: {
            organizationId: organization.id,
            planId: plan.id,
            status: PlanStatus.ACTIVE,
            startDate,
            endDate,
            employeeLimit: plan.maxEmployees,
            employeeCount: 0, // Admin doesn't count towards employee limit
          },
        });

        // Update organization current plan
        await tx.organization.update({
          where: { id: organization.id },
          data: { currentPlanId: subscription.id },
        });
      }

      return { organization, adminUser, subscription };
    });

    res.status(201).json({
      success: true,
      message: "Organization created successfully",
      data: {
        organization: result.organization,
        admin: {
          id: result.adminUser.id,
          name: result.adminUser.name,
          email: result.adminUser.email,
          role: result.adminUser.role,
        },
        subscription: result.subscription,
      },
    });
  } catch (error) {
    console.error("Create organization error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating organization",
    });
  }
});

// Update organization (Admin) - OPTIMIZED
router.put(
  "/:id",
  requireAdmin(),
  async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name, email, phone, address, website, isActive } = req.body;

      // OPTIMIZATION: Only fetch if email is changing
      let existingCheck = Promise.resolve(null);
      if (email) {
        //@ts-ignore
        existingCheck = db.organization.findFirst({
          where: {
            email,
            id: { not: id },
          },
          select: { id: true },
        });
      }

      const [organization, existingOrg] = await Promise.all([
        db.organization.findUnique({
          where: { id },
          select: { id: true, email: true },
        }),
        existingCheck,
      ]);

      if (!organization) {
        return res.status(404).json({
          success: false,
          message: "Organization not found",
        });
      }

      if (existingOrg) {
        return res.status(400).json({
          success: false,
          message: "Email already in use by another organization",
        });
      }

      const updatedOrganization = await db.organization.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(email && { email }),
          ...(phone !== undefined && { phone }),
          ...(address !== undefined && { address }),
          ...(website !== undefined && { website }),
          ...(isActive !== undefined && { isActive }),
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          website: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          currentPlan: {
            select: {
              id: true,
              status: true,
              employeeLimit: true,
              employeeCount: true,
              startDate: true,
              endDate: true,
              plan: true,
            },
          },
        },
      });

      res.json({
        success: true,
        message: "Organization updated successfully",
        data: updatedOrganization,
      });
    } catch (error) {
      console.error("Update organization error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating organization",
      });
    }
  }
);

// Delete organization (Super Admin only) - OPTIMIZED
router.delete(
  "/:id",
  requireAdmin(),
  async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const organization = await db.organization.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              employees: {
                where: { status: EmployeeStatus.ACTIVE },
              },
            },
          },
        },
      });

      if (!organization) {
        return res.status(404).json({
          success: false,
          message: "Organization not found",
        });
      }

      // Check if organization has active employees
      if (organization._count.employees > 0) {
        return res.status(400).json({
          success: false,
          message:
            "Cannot delete organization with active employees. Deactivate the organization instead.",
        });
      }

      // Soft delete by deactivating
      await db.organization.update({
        where: { id },
        data: { isActive: false },
      });

      res.json({
        success: true,
        message: "Organization deactivated successfully",
      });
    } catch (error) {
      console.error("Delete organization error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting organization",
      });
    }
  }
);

// Assign plan to organization (Super Admin only) - OPTIMIZED
router.post(
  "/:id/assign-plan",
  requireAdmin(),
  async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { planId } = req.body;

      if (!planId) {
        return res.status(400).json({
          success: false,
          message: "Plan ID is required",
        });
      }

      const [organization, plan] = await Promise.all([
        db.organization.findUnique({
          where: { id },
          select: {
            id: true,
            name: true,
            _count: {
              select: {
                employees: {
                  where: {
                    status: EmployeeStatus.ACTIVE,
                    role: { not: Role.ORG_ADMIN },
                  },
                },
              },
            },
          },
        }),
        db.plan.findUnique({
          where: { id: planId, isActive: true },
          select: { id: true, maxEmployees: true, billingCycle: true },
        }),
      ]);

      if (!organization) {
        return res.status(404).json({
          success: false,
          message: "Organization not found",
        });
      }

      if (!plan) {
        return res.status(404).json({
          success: false,
          message: "Plan not found or inactive",
        });
      }

      // Check if current employees exceed plan limit
      const currentEmployeeCount = organization._count.employees;

      if (currentEmployeeCount > plan.maxEmployees) {
        return res.status(400).json({
          success: false,
          message: `Cannot assign plan. Current employee count (${currentEmployeeCount}) exceeds plan limit (${plan.maxEmployees})`,
        });
      }

      // Calculate dates
      const startDate = new Date();
      const endDate = new Date(startDate);
      if (plan.billingCycle === "yearly") {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
      }

      const result = await db.$transaction(async (tx) => {
        // Deactivate current subscription
        await tx.subscription.updateMany({
          where: {
            organizationId: id,
            status: PlanStatus.ACTIVE,
          },
          data: {
            status: PlanStatus.INACTIVE,
          },
        });

        // Create new subscription
        const subscription = await tx.subscription.create({
          data: {
            organizationId: id,
            planId,
            status: PlanStatus.ACTIVE,
            startDate,
            endDate,
            employeeLimit: plan.maxEmployees,
            employeeCount: currentEmployeeCount,
          },
        });

        // Update organization current plan
        await tx.organization.update({
          where: { id },
          data: { currentPlanId: subscription.id },
        });

        return subscription;
      });

      res.json({
        success: true,
        message: "Plan assigned successfully",
        data: result,
      });
    } catch (error) {
      console.error("Assign plan error:", error);
      res.status(500).json({
        success: false,
        message: "Error assigning plan",
      });
    }
  }
);

// Get organization analytics (Admin) - OPTIMIZED
router.get(
  "/:id/analytics",
  requireAdmin(),
  async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { period = "30" } = req.query;

      const organization = await db.organization.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!organization) {
        return res.status(404).json({
          success: false,
          message: "Organization not found",
        });
      }

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - Number(period));

      // Get employees efficiently
      const employees = await db.organizationUser.findMany({
        where: {
          organizationId: id,
          status: EmployeeStatus.ACTIVE,
        },
        select: {
          user: {
            select: {
              id: true,
              name: true,
              coinsEarned: true,
            },
          },
        },
      });

      const employeeIds = employees.map((emp) => emp.user.id);

      if (employeeIds.length === 0) {
        return res.json({
          success: true,
          data: {
            summary: {
              totalEmployees: 0,
              newEnrollments: 0,
              completedChapters: 0,
              quizzesAttempted: 0,
              averageQuizScore: 0,
            },
            categoryStats: {},
            dailyActivity: [],
            topPerformers: [],
            recentActivity: [],
          },
        });
      }

      // Get analytics data in parallel
      const [enrollments, completedChapters, quizResults, recentActivity] =
        await Promise.all([
          db.enrolledCourse.findMany({
            where: {
              userId: { in: employeeIds },
              createdAt: { gte: startDate },
            },
            select: {
              createdAt: true,
              userId: true,
              course: {
                select: { category: true, title: true },
              },
            },
          }),
          db.chapterProgress.findMany({
            where: {
              userId: { in: employeeIds },
              completed: true,
              watchedAt: { gte: startDate },
            },
            select: {
              userId: true,
              watchedAt: true,
            },
          }),
          db.quizResult.findMany({
            where: {
              userId: { in: employeeIds },
              attemptedAt: { gte: startDate },
            },
            select: {
              score: true,
            },
          }),
          db.chapterProgress.findMany({
            where: {
              userId: { in: employeeIds },
              watchedAt: { gte: startDate },
            },
            select: {
              watchedAt: true,
              user: {
                select: { name: true },
              },
              chapter: {
                select: {
                  title: true,
                  course: {
                    select: { title: true },
                  },
                },
              },
            },
            orderBy: { watchedAt: "desc" },
            take: 20,
          }),
        ]);

      // Process analytics efficiently
      const categoryStats = enrollments.reduce((acc, enrollment) => {
        const category = enrollment.course.category;
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Generate daily activity
      const dailyActivity = [];
      for (let i = Number(period) - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];

        const dayEnrollments = enrollments.filter(
          (e) => e.createdAt.toISOString().split("T")[0] === dateStr
        ).length;

        const dayCompletions = completedChapters.filter(
          (c) => c.watchedAt.toISOString().split("T")[0] === dateStr
        ).length;

        dailyActivity.push({
          date: dateStr,
          enrollments: dayEnrollments,
          completions: dayCompletions,
        });
      }

      // Calculate top performers
      const performanceMap = new Map();
      employees.forEach((emp) => {
        const userEnrollments = enrollments.filter(
          (e) => e.userId === emp.user.id
        ).length;
        const userCompletions = completedChapters.filter(
          (c) => c.userId === emp.user.id
        ).length;

        performanceMap.set(emp.user.id, {
          name: emp.user.name,
          coinsEarned: emp.user.coinsEarned,
          enrollments: userEnrollments,
          completions: userCompletions,
        });
      });

      const topPerformers = Array.from(performanceMap.values())
        .sort((a, b) => b.coinsEarned - a.coinsEarned)
        .slice(0, 10);

      res.json({
        success: true,
        data: {
          summary: {
            totalEmployees: employees.length,
            newEnrollments: enrollments.length,
            completedChapters: completedChapters.length,
            quizzesAttempted: quizResults.length,
            averageQuizScore:
              quizResults.length > 0
                ? Math.round(
                    quizResults.reduce((sum, q) => sum + q.score, 0) /
                      quizResults.length
                  )
                : 0,
          },
          categoryStats,
          dailyActivity,
          topPerformers,
          recentActivity: recentActivity.map((activity) => ({
            userName: activity.user.name,
            action: "Watched",
            content: `${activity.chapter.title} - ${activity.chapter.course.title}`,
            timestamp: activity.watchedAt,
          })),
        },
      });
    } catch (error) {
      console.error("Get organization analytics error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching organization analytics",
      });
    }
  }
);

export default router;
