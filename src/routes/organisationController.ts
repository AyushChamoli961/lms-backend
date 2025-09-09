import { Router, Request, Response } from "express";
import { db } from "../helper/db";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { Role, PlanStatus, EmployeeStatus } from "@prisma/client";
import { REPLCommand } from "repl";
import { AuthRequest } from "../middleware/orgAuth";

const router = Router();

// Organization Registration
router.post("/register", async (req: Request, res: Response) => {
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

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

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
          isVerified: true, // Auto-verify org admin
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

      return { organization, adminUser };
    });

    // Generate JWT token for admin
    const secret = process.env.JWT_SECRET || "DEV_DUMMY_JWT_SECRET_CHANGE_ME";
    const token = jwt.sign(
      {
        sub: result.adminUser.id,
        email: result.adminUser.email,
        name: result.adminUser.name,
        role: result.adminUser.role,
        organizationId: result.organization.id,
      },
      secret,
      { expiresIn: "30d" }
    );

    res.status(201).json({
      success: true,
      message: "Organization registered successfully",
      data: {
        organization: result.organization,
        admin: {
          id: result.adminUser.id,
          name: result.adminUser.name,
          email: result.adminUser.email,
          role: result.adminUser.role,
        },
        token,
      },
    });
  } catch (error) {
    console.error("Organization registration error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during registration",
    });
  }
});

// Get Available Plans
router.get("/plans", async (req: Request, res: Response) => {
  try {
    const plans = await db.plan.findMany({
      where: { isActive: true },
      orderBy: { price: "asc" },
    });

    res.json({
      success: true,
      data: plans,
    });
  } catch (error) {
    console.error("Get plans error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching plans",
    });
  }
});

// Subscribe to Plan
router.post("/subscribe", async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId, planId } = req.body;
    const userId = req.user?.id; // From auth middleware

    if (!organizationId || !planId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID and Plan ID are required",
      });
    }

    // Verify user is org admin
    const orgUser = await db.organizationUser.findFirst({
      where: {
        organizationId,
        userId,
        role: Role.ORG_ADMIN,
        status: EmployeeStatus.ACTIVE,
      },
    });

    if (!orgUser) {
      return res.status(403).json({
        success: false,
        message: "Only organization admin can subscribe to plans",
      });
    }

    // Get plan details
    const plan = await db.plan.findUnique({
      where: { id: planId },
    });

    if (!plan || !plan.isActive) {
      return res.status(404).json({
        success: false,
        message: "Plan not found or inactive",
      });
    }

    // Calculate end date based on billing cycle
    const startDate = new Date();
    const endDate = new Date(startDate);
    if (plan.billingCycle === "yearly") {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    const result = await db.$transaction(async (tx) => {
      // Deactivate current subscription if exists
      await tx.subscription.updateMany({
        where: {
          organizationId,
          status: PlanStatus.ACTIVE,
        },
        data: {
          status: PlanStatus.INACTIVE,
        },
      });

      // Create new subscription
      const subscription = await tx.subscription.create({
        data: {
          organizationId,
          planId,
          status: PlanStatus.ACTIVE,
          startDate,
          endDate,
          employeeLimit: plan.maxEmployees,
          employeeCount: 1, // Admin is already counted
        },
      });

      // Update organization current plan
      await tx.organization.update({
        where: { id: organizationId },
        data: {
          currentPlanId: subscription.id,
        },
      });

      return subscription;
    });

    res.json({
      success: true,
      message: "Successfully subscribed to plan",
      data: result,
    });
  } catch (error) {
    console.error("Plan subscription error:", error);
    res.status(500).json({
      success: false,
      message: "Error subscribing to plan",
    });
  }
});

// Organization Dashboard
router.get(
  "/dashboard/:organizationId",
  async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId } = req.params;
      const userId = req.user?.id;

      // Verify user belongs to organization
      const orgUser = await db.organizationUser.findFirst({
        where: {
          organizationId,
          userId,
          status: EmployeeStatus.ACTIVE,
        },
      });

      if (!orgUser) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this organization",
        });
      }

      // Get organization with current subscription
      const organization = await db.organization.findUnique({
        where: { id: organizationId },
        include: {
          currentPlan: {
            include: {
              plan: true,
            },
          },
          employees: {
            where: {
              status: {
                in: [EmployeeStatus.ACTIVE, EmployeeStatus.PENDING_INVITATION],
              },
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  isVerified: true,
                  coinsEarned: true,
                  createdAt: true,
                },
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

      // Get employee statistics
      const activeEmployees = organization.employees.filter(
        (emp) => emp.status === EmployeeStatus.ACTIVE
      ).length;
      const pendingInvitations = organization.employees.filter(
        (emp) => emp.status === EmployeeStatus.PENDING_INVITATION
      ).length;

      // Get course enrollment stats for organization employees
      const employeeIds = organization.employees
        .filter((emp) => emp.status === EmployeeStatus.ACTIVE)
        .map((emp) => emp.userId);

      const enrollmentStats = await db.enrolledCourse.findMany({
        where: {
          userId: { in: employeeIds },
        },
        include: {
          course: {
            select: {
              title: true,
              category: true,
            },
          },
        },
      });

      const totalEnrollments = enrollmentStats.length;
      const coursesByCategory = enrollmentStats.reduce((acc, enrollment) => {
        const category = enrollment.course.category;
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      res.json({
        success: true,
        data: {
          organization: {
            id: organization.id,
            name: organization.name,
            email: organization.email,
            phone: organization.phone,
            website: organization.website,
            isActive: organization.isActive,
          },
          subscription: organization.currentPlan
            ? {
                planName: organization.currentPlan.plan.name,
                planType: organization.currentPlan.plan.type,
                employeeLimit: organization.currentPlan.employeeLimit,
                employeeCount: organization.currentPlan.employeeCount,
                status: organization.currentPlan.status,
                startDate: organization.currentPlan.startDate,
                endDate: organization.currentPlan.endDate,
              }
            : null,
          statistics: {
            activeEmployees,
            pendingInvitations,
            totalEnrollments,
            coursesByCategory,
            employeeLimit: organization.currentPlan?.employeeLimit || 0,
          },
          employees: organization.employees.map((emp) => ({
            id: emp.id,
            role: emp.role,
            status: emp.status,
            joinedAt: emp.joinedAt,
            user: emp.user,
          })),
        },
      });
    } catch (error) {
      console.error("Dashboard error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching dashboard data",
      });
    }
  }
);

// Invite Employee
router.post("/invite-employee", async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId, email, role = Role.ORG_EMPLOYEE } = req.body;
    const userId = req.user?.id;

    // Early validation - ensure user is authenticated
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!organizationId || !email) {
      return res.status(400).json({
        success: false,
        message: "Organization ID and email are required",
      });
    }

    // Verify user is org admin
    const orgUser = await db.organizationUser.findFirst({
      where: {
        organizationId,
        userId,
        role: Role.ORG_ADMIN,
        status: EmployeeStatus.ACTIVE,
      },
    });

    if (!orgUser) {
      return res.status(403).json({
        success: false,
        message: "Only organization admin can invite employees",
      });
    }

    // Check subscription limits
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      include: {
        currentPlan: true,
        employees: {
          where: { status: EmployeeStatus.ACTIVE },
        },
      },
    });

    if (!organization?.currentPlan) {
      return res.status(400).json({
        success: false,
        message:
          "Organization must have an active subscription to invite employees",
      });
    }

    if (
      organization.employees.length >= organization.currentPlan.employeeLimit
    ) {
      return res.status(400).json({
        success: false,
        message: "Employee limit reached for current plan",
      });
    }

    // Check if user already exists or is already invited
    const existingUser = await db.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      const existingOrgUser = await db.organizationUser.findFirst({
        where: {
          organizationId,
          userId: existingUser.id,
        },
      });

      if (existingOrgUser) {
        return res.status(400).json({
          success: false,
          message: "User is already part of this organization",
        });
      }
    }

    // Check for existing pending invitation
    const existingInvitation = await db.invitation.findFirst({
      where: {
        organizationId,
        email,
        isAccepted: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvitation) {
      return res.status(400).json({
        success: false,
        message: "Invitation already sent to this email",
      });
    }

    // Generate invitation token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    // Create invitation - now userId is guaranteed to be string
    const invitation = await db.invitation.create({
      data: {
        organizationId,
        invitedById: userId, // Now TypeScript knows this is string
        invitedUserId: existingUser?.id,
        email,
        role: role as Role,
        token,
        expiresAt,
      },
      include: {
        organization: true,
        invitedBy: {
          select: { name: true, email: true },
        },
      },
    });

    // TODO: Send invitation email here
    // You would integrate with your email service (SendGrid, AWS SES, etc.)
    console.log(
      `Invitation email should be sent to ${email} with token: ${token}`
    );

    res.json({
      success: true,
      message: "Employee invitation sent successfully",
      data: {
        invitationId: invitation.id,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
        // In development, include the token for testing
        ...(process.env.NODE_ENV === "development" && { token }),
      },
    });
  } catch (error) {
    console.error("Invite employee error:", error);
    res.status(500).json({
      success: false,
      message: "Error sending employee invitation",
    });
  }
});

// Accept Invitation
router.post("/accept-invitation", async (req: Request, res: Response) => {
  try {
    const { token, name, password } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Invitation token is required",
      });
    }

    // Find valid invitation
    const invitation = await db.invitation.findUnique({
      where: { token },
      include: {
        organization: true,
        invitedUser: true,
      },
    });

    if (
      !invitation ||
      invitation.isAccepted ||
      invitation.expiresAt < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired invitation",
      });
    }

    let user = invitation.invitedUser;

    // If user doesn't exist, create new user
    if (!user) {
      if (!name || !password) {
        return res.status(400).json({
          success: false,
          message: "Name and password are required for new users",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      user = await db.user.create({
        data: {
          name,
          email: invitation.email,
          password: hashedPassword,
          role: invitation.role,
          isVerified: true,
        },
      });
    }

    // Accept invitation and create organization user relationship
    await db.$transaction(async (tx) => {
      // Mark invitation as accepted
      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          isAccepted: true,
          acceptedAt: new Date(),
          invitedUserId: user!.id,
        },
      });

      // Create organization user relationship
      await tx.organizationUser.create({
        data: {
          organizationId: invitation.organizationId,
          userId: user!.id,
          role: invitation.role,
          status: EmployeeStatus.ACTIVE,
        },
      });

      // Update subscription employee count
      await tx.subscription.update({
        where: { id: invitation.organization.currentPlanId! },
        data: {
          employeeCount: { increment: 1 },
        },
      });
    });

    // Generate JWT token
    const secret = process.env.JWT_SECRET || "DEV_DUMMY_JWT_SECRET_CHANGE_ME";
    const jwtToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: invitation.organizationId,
      },
      secret,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      message: "Invitation accepted successfully",
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        organization: invitation.organization,
        token: jwtToken,
      },
    });
  } catch (error) {
    console.error("Accept invitation error:", error);
    res.status(500).json({
      success: false,
      message: "Error accepting invitation",
    });
  }
});

// Get Employee Progress
router.get(
  "/employee-progress/:organizationId/:employeeId",
  async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId, employeeId } = req.params;
      const userId = req.user?.id;

      // Verify user is org admin
      const orgUser = await db.organizationUser.findFirst({
        where: {
          organizationId,
          userId,
          role: Role.ORG_ADMIN,
          status: EmployeeStatus.ACTIVE,
        },
      });

      if (!orgUser) {
        return res.status(403).json({
          success: false,
          message: "Only organization admin can view employee progress",
        });
      }

      // Verify employee belongs to organization
      const employee = await db.organizationUser.findFirst({
        where: {
          organizationId,
          userId: employeeId,
          status: EmployeeStatus.ACTIVE,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              coinsEarned: true,
            },
          },
        },
      });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found in this organization",
        });
      }

      // Get enrolled courses with progress
      const enrolledCourses = await db.enrolledCourse.findMany({
        where: { userId: employeeId },
        include: {
          course: {
            include: {
              chapters: {
                include: {
                  progress: {
                    where: { userId: employeeId },
                  },
                },
              },
            },
          },
        },
      });

      // Get quiz results
      const quizResults = await db.quizResult.findMany({
        where: { userId: employeeId },
        include: {
          quiz: {
            include: {
              chapter: {
                include: {
                  course: {
                    select: { title: true },
                  },
                },
              },
            },
          },
        },
      });

      // Calculate progress statistics
      const progressStats = enrolledCourses.map((enrollment) => {
        const course = enrollment.course;
        const totalChapters = course.chapters.length;
        const completedChapters = course.chapters.filter((chapter) =>
          chapter.progress.some((p) => p.completed)
        ).length;

        const progressPercentage =
          totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0;

        return {
          courseId: course.id,
          courseTitle: course.title,
          category: course.category,
          totalChapters,
          completedChapters,
          progressPercentage: Math.round(progressPercentage),
          enrolledAt: enrollment.createdAt,
        };
      });

      const quizStats = quizResults.map((result) => ({
        quizId: result.quiz.id,
        quizTitle: result.quiz.title,
        courseTitle: result.quiz.chapter.course.title,
        chapterTitle: result.quiz.chapter.title,
        score: result.score,
        passed: result.passed,
        attemptedAt: result.attemptedAt,
      }));

      res.json({
        success: true,
        data: {
          employee: employee.user,
          progressStats,
          quizStats,
          overallStats: {
            totalCourses: enrolledCourses.length,
            totalCoinsEarned: employee.user.coinsEarned,
            totalQuizzes: quizResults.length,
            passedQuizzes: quizResults.filter((q) => q.passed).length,
            averageQuizScore:
              quizResults.length > 0
                ? Math.round(
                    quizResults.reduce((sum, q) => sum + q.score, 0) /
                      quizResults.length
                  )
                : 0,
          },
        },
      });
    } catch (error) {
      console.error("Employee progress error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching employee progress",
      });
    }
  }
);

// Remove Employee
router.delete(
  "/remove-employee/:organizationId/:employeeId",
  async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId, employeeId } = req.params;
      const userId = req.user?.id;

      // Verify user is org admin
      const orgUser = await db.organizationUser.findFirst({
        where: {
          organizationId,
          userId,
          role: Role.ORG_ADMIN,
          status: EmployeeStatus.ACTIVE,
        },
      });

      if (!orgUser) {
        return res.status(403).json({
          success: false,
          message: "Only organization admin can remove employees",
        });
      }

      // Cannot remove self
      if (employeeId === userId) {
        return res.status(400).json({
          success: false,
          message: "Cannot remove yourself from the organization",
        });
      }

      // Find employee
      const employee = await db.organizationUser.findFirst({
        where: {
          organizationId,
          userId: employeeId,
          status: EmployeeStatus.ACTIVE,
        },
      });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found in this organization",
        });
      }

      // Remove employee and update subscription count
      await db.$transaction(async (tx) => {
        // Update employee status to inactive
        await tx.organizationUser.update({
          where: { id: employee.id },
          data: { status: EmployeeStatus.INACTIVE },
        });

        // Update subscription employee count
        const org = await tx.organization.findUnique({
          where: { id: organizationId },
        });

        if (org?.currentPlanId) {
          await tx.subscription.update({
            where: { id: org.currentPlanId },
            data: {
              employeeCount: { decrement: 1 },
            },
          });
        }
      });

      res.json({
        success: true,
        message: "Employee removed successfully",
      });
    } catch (error) {
      console.error("Remove employee error:", error);
      res.status(500).json({
        success: false,
        message: "Error removing employee",
      });
    }
  }
);

export default router;
