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

// Get all organizations (Super Admin only)
router.get(
  "/organizations",
  requireSuperAdmin,
  async (req: AuthedRequest, res: Response) => {
    try {
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

      const [organizations, totalCount] = await Promise.all([
        db.organization.findMany({
          where,
          include: {
            currentPlan: {
              include: {
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
            employees: {
              where: { status: EmployeeStatus.ACTIVE },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                  },
                },
              },
            },
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
        }),
        db.organization.count({ where }),
      ]);

      const organizationsWithStats = organizations.map((org) => ({
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
              planName: org.currentPlan.plan.name,
              planType: org.currentPlan.plan.type,
              status: org.currentPlan.status,
              employeeLimit: org.currentPlan.employeeLimit,
              employeeCount: org.currentPlan.employeeCount,
              startDate: org.currentPlan.startDate,
              endDate: org.currentPlan.endDate,
            }
          : null,
        stats: {
          totalEmployees: org._count.employees,
          totalSubscriptions: org._count.subscriptions,
          adminUser: org.employees.find(
            (emp) => emp.user.role === Role.ORG_ADMIN
          )?.user,
        },
      }));

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
      res.status(500).json({
        success: false,
        message: "Error fetching organizations",
      });
    }
  }
);

// Get organization details (Admin)
router.get(
  "/organizations/:id",
  requireAdmin(),
  async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const organization = await db.organization.findUnique({
        where: { id },
        include: {
          currentPlan: {
            include: {
              plan: true,
            },
          },
          subscriptions: {
            include: {
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
            include: {
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
            include: {
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
      });

      if (!organization) {
        return res.status(404).json({
          success: false,
          message: "Organization not found",
        });
      }

      // Get employee performance data
      const employeeIds = organization.employees.map((emp) => emp.user.id);

      const [enrolledCourses, chaptersProgress, quizResults] =
        await Promise.all([
          db.enrolledCourse.findMany({
            where: { userId: { in: employeeIds } },
            include: {
              course: {
                select: { id: true, title: true, category: true },
              },
            },
          }),
          db.chapterProgress.findMany({
            where: {
              userId: { in: employeeIds },
              completed: true,
            },
          }),
          db.quizResult.findMany({
            where: { userId: { in: employeeIds } },
          }),
        ]);

      // Calculate performance metrics
      const performanceMetrics = organization.employees.map((emp) => {
        const userEnrollments = enrolledCourses.filter(
          (e) => e.userId === emp.user.id
        );
        const userProgress = chaptersProgress.filter(
          (p) => p.userId === emp.user.id
        );
        const userQuizzes = quizResults.filter((q) => q.userId === emp.user.id);
        const userPassedQuizzes = userQuizzes.filter((q) => q.passed);

        return {
          ...emp,
          performance: {
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
          },
        };
      });

      res.json({
        success: true,
        data: {
          ...organization,
          employees: performanceMetrics,
          stats: {
            totalEmployees: organization.employees.length,
            activeEmployees: organization.employees.filter(
              (emp) => emp.status === EmployeeStatus.ACTIVE
            ).length,
            pendingInvitations: organization.invitations.length,
            totalEnrollments: enrolledCourses.length,
            totalCoinsEarned: organization.employees.reduce(
              (sum, emp) => sum + emp.user.coinsEarned,
              0
            ),
          },
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

// Create organization (Super Admin only)
router.post(
  "/organizations",
  requireSuperAdmin,
  async (req: AuthedRequest, res: Response) => {
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

      // Check if organization already exists
      const existingOrg = await db.organization.findUnique({
        where: { email },
      });

      if (existingOrg) {
        return res.status(400).json({
          success: false,
          message: "Organization already exists with this email",
        });
      }

      // Check if admin user already exists
      const existingAdmin = await db.user.findUnique({
        where: { email: adminEmail },
      });

      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          message: "User already exists with this admin email",
        });
      }

      // Validate plan if provided
      let plan: {
        id: string;
        maxEmployees: number;
        billingCycle: string;
      } | null = null;
      if (planId) {
        plan = await db.plan.findUnique({
          where: { id: planId, isActive: true },
          select: { id: true, maxEmployees: true, billingCycle: true },
        });

        if (!plan) {
          return res.status(400).json({
            success: false,
            message: "Invalid or inactive plan selected",
          });
        }
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
  }
);

// Update organization (Admin)
router.put(
  "/organizations/:id",
  requireAdmin(),
  async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name, email, phone, address, website, isActive } = req.body;

      const organization = await db.organization.findUnique({
        where: { id },
      });

      if (!organization) {
        return res.status(404).json({
          success: false,
          message: "Organization not found",
        });
      }

      // Check if email is being changed and if it conflicts
      if (email && email !== organization.email) {
        const existingOrg = await db.organization.findUnique({
          where: { email },
        });

        if (existingOrg) {
          return res.status(400).json({
            success: false,
            message: "Email already in use by another organization",
          });
        }
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
        include: {
          currentPlan: {
            include: {
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

// Delete organization (Super Admin only)
router.delete(
  "/organizations/:id",
  requireSuperAdmin,
  async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const organization = await db.organization.findUnique({
        where: { id },
        include: {
          employees: true,
          subscriptions: true,
        },
      });

      if (!organization) {
        return res.status(404).json({
          success: false,
          message: "Organization not found",
        });
      }

      // Check if organization has active employees
      const activeEmployees = organization.employees.filter(
        (emp) => emp.status === EmployeeStatus.ACTIVE
      );

      if (activeEmployees.length > 0) {
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

// Assign plan to organization (Super Admin only)
router.post(
  "/organizations/:id/assign-plan",
  requireSuperAdmin,
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
          include: {
            employees: {
              where: { status: EmployeeStatus.ACTIVE },
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
      const currentEmployeeCount = organization.employees.filter(
        (emp) => emp.role !== Role.ORG_ADMIN
      ).length;

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

// Get organization analytics (Admin)
router.get(
  "/organizations/:id/analytics",
  requireAdmin(),
  async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { period = "30" } = req.query;

      const organization = await db.organization.findUnique({
        where: { id },
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

      // Get employees
      const employees = await db.organizationUser.findMany({
        where: {
          organizationId: id,
          status: EmployeeStatus.ACTIVE,
        },
        include: {
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

      // Get analytics data
      const [enrollments, completedChapters, quizResults, recentActivity] =
        await Promise.all([
          db.enrolledCourse.findMany({
            where: {
              userId: { in: employeeIds },
              createdAt: { gte: startDate },
            },
            include: {
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
          }),
          db.quizResult.findMany({
            where: {
              userId: { in: employeeIds },
              attemptedAt: { gte: startDate },
            },
          }),
          db.chapterProgress.findMany({
            where: {
              userId: { in: employeeIds },
              watchedAt: { gte: startDate },
            },
            include: {
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

      // Process analytics
      const categoryStats = enrollments.reduce((acc, enrollment) => {
        const category = enrollment.course.category;
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

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

      const topPerformers = employees
        .map((emp) => ({
          name: emp.user.name,
          coinsEarned: emp.user.coinsEarned,
          enrollments: enrollments.filter((e) => e.userId === emp.user.id)
            .length,
          completions: completedChapters.filter((c) => c.userId === emp.user.id)
            .length,
        }))
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
            action: activity.completed ? "Completed" : "Watched",
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

