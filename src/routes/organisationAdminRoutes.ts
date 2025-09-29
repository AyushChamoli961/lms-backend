import { Router, Response } from "express";
import { db } from "../helper/db";
import bcrypt from "bcrypt";
import { Role, PlanStatus, EmployeeStatus } from "@prisma/client";
import { AuthedRequest, requireOrgAdmin } from "../middleware/admin";
import transporter from "../helper/nodeMailer";
const router = Router();

// Dashboard API - Get organization overview (requires org admin auth)
router.get(
  "/dashboard",
  requireOrgAdmin,
  async (req: AuthedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      const userId = req.user?.id;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "Organization ID not found in user context",
        });
      }

      // Get organization details with current plan and employees
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
              status: EmployeeStatus.ACTIVE,
              userId: { not: userId }, // Exclude admin from employee count
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
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

      // Get employee progress summary
      const employeeIds = organization.employees.map((emp) => emp.user.id);

      // Get enrolled courses count for all employees
      const enrolledCourses = await db.enrolledCourse.findMany({
        where: { userId: { in: employeeIds } },
        include: {
          course: {
            select: { id: true, title: true, category: true },
          },
        },
      });

      // Get chapter progress for all employees
      const chaptersProgress = await db.chapterProgress.findMany({
        where: {
          userId: { in: employeeIds },
          completed: true,
        },
      });

      // Get quiz results for all employees
      const quizResults = await db.quizResult.findMany({
        where: { userId: { in: employeeIds } },
      });

      // Calculate statistics
      const totalEmployees = organization.employees.length;
      const totalCoinsEarned = organization.employees.reduce(
        (sum, emp) => sum + emp.user.coinsEarned,
        0
      );
      const totalCoursesEnrolled = enrolledCourses.length;
      const totalChaptersCompleted = chaptersProgress.length;
      const totalQuizzesAttempted = quizResults.length;
      const totalQuizzesPassed = quizResults.filter((q) => q.passed).length;

      // Employee performance breakdown
      const employeePerformance = organization.employees.map((emp) => {
        const userEnrollments = enrolledCourses.filter(
          (e) => e.userId === emp.user.id
        );
        const userProgress = chaptersProgress.filter(
          (p) => p.userId === emp.user.id
        );
        const userQuizzes = quizResults.filter((q) => q.userId === emp.user.id);
        const userPassedQuizzes = userQuizzes.filter((q) => q.passed);

        return {
          employeeId: emp.user.id,
          name: emp.user.name,
          email: emp.user.email,
          role: emp.role,
          joinedAt: emp.joinedAt,
          coinsEarned: emp.user.coinsEarned,
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
        };
      });

      // Course popularity
      const courseStats = enrolledCourses.reduce((acc, enrollment) => {
        const courseId = enrollment.course.id;
        if (!acc[courseId]) {
          acc[courseId] = {
            courseId,
            title: enrollment.course.title,
            category: enrollment.course.category,
            enrollmentCount: 0,
          };
        }
        acc[courseId].enrollmentCount++;
        return acc;
      }, {} as Record<string, any>);

      const popularCourses = Object.values(courseStats)
        .sort((a: any, b: any) => b.enrollmentCount - a.enrollmentCount)
        .slice(0, 5);

      // Plan utilization
      const planUtilization = organization.currentPlan
        ? {
            planName: organization.currentPlan.plan.name,
            planType: organization.currentPlan.plan.type,
            employeeLimit: organization.currentPlan.plan.maxEmployees,
            currentEmployees: totalEmployees,
            utilizationPercentage: Math.round(
              (totalEmployees / organization.currentPlan.plan.maxEmployees) *
                100
            ),
            planStatus: organization.currentPlan.status,
            planStartDate: organization.currentPlan.startDate,
            planEndDate: organization.currentPlan.endDate,
            autoRenew: organization.currentPlan.autoRenew,
          }
        : null;

      res.json({
        success: true,
        data: {
          organization: {
            id: organization.id,
            name: organization.name,
            email: organization.email,
            phone: organization.phone,
            website: organization.website,
            logo: organization.logo,
            isActive: organization.isActive,
            createdAt: organization.createdAt,
          },
          planUtilization,
          overallStats: {
            totalEmployees,
            totalCoinsEarned,
            totalCoursesEnrolled,
            totalChaptersCompleted,
            totalQuizzesAttempted,
            totalQuizzesPassed,
            averageQuizSuccessRate:
              totalQuizzesAttempted > 0
                ? Math.round((totalQuizzesPassed / totalQuizzesAttempted) * 100)
                : 0,
          },
          employeePerformance,
          popularCourses,
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

// Subscribe to Plan (requires org admin auth)
router.post(
  "/subscribe",
  requireOrgAdmin,
  async (req: AuthedRequest, res: Response) => {
    try {
      const { planId } = req.body;
      const organizationId = req.user?.organizationId;
      const userId = req.user?.id;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "Organization ID not found in user context",
        });
      }

      if (!planId) {
        return res.status(400).json({
          success: false,
          message: "Plan ID is required",
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

      // Get current employee count (excluding admin)
      const currentEmployeeCount = await db.organizationUser.count({
        where: {
          organizationId,
          status: EmployeeStatus.ACTIVE,
          userId: { not: userId }, // Exclude admin
        },
      });

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
            employeeCount: currentEmployeeCount, // Only count employees, not admin
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
  }
);

// Invite Employee (requires org admin auth)
router.post(
  "/invite-employee",
  requireOrgAdmin,
  async (req: AuthedRequest, res: Response) => {
    try {
      const { email, role = Role.ORG_EMPLOYEE, employeeData } = req.body;

      const organizationId = req.user?.organizationId;
      const userId = req.user?.id;

      if (!userId || !organizationId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }
      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required",
        });
      }
      const { name, phone, password } = employeeData || {};
      if (!name || !password) {
        return res.status(400).json({
          success: false,
          message: "Employee name and password are required",
        });
      }

      // Plan/limit checks unchanged
      const organization = await db.organization.findUnique({
        where: { id: organizationId },
        include: {
          currentPlan: true,
          employees: {
            where: {
              status: EmployeeStatus.ACTIVE,
              userId: { not: userId }, // Exclude admin from count
            },
          },
        },
      });
      if (!organization?.currentPlan) {
        return res.status(400).json({
          success: false,
          message:
            "Organization must have an active subscription to add employees",
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

      // Check existing user
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

      const hashedPassword = await bcrypt.hash(password, 12);

      let result;
      // --- USER + ORGUSER TRANSACTION FIRST -------------------
      result = await db.$transaction(async (tx) => {
        let employee;
        if (existingUser) {
          employee = existingUser;
        } else {
          employee = await tx.user.create({
            data: {
              name,
              email,
              phone,
              password: hashedPassword,
              role: role as Role,
              isVerified: true,
            },
          });
        }

        const orgEmployee = await tx.organizationUser.create({
          data: {
            organizationId,
            userId: employee.id,
            role: role as Role,
            status: EmployeeStatus.ACTIVE,
          },
        });

        await tx.subscription.update({
          where: { id: organization.currentPlan!.id },
          data: {
            employeeCount: { increment: 1 },
          },
        });

        return { employee, orgEmployee };
      });

      // --- EMAIL ATTEMPT OUTSIDE TRANSACTION ------------------
     let emailSent = false;
     let emailError: any = undefined;
     try {
       await transporter.sendMail({
         from: "",
         to: email,
         subject: `You have been invited to join ${organization.name} on Novojuris`,
         text: `
Hello ${name},

You have been invited to join the organization "${organization.name}" on Novojuris!

You can log in with your email: ${email}
Temporary password: ${password}

Please log in and change your password after your first sign in.

Click here to login: 

If you have any questions, ask your organization admin.

Welcome to the team!
`,
         html: `
      <p>Hello <b>${name}</b>,</p>
      <p>
        You have been <b>invited</b> to join the organization <b>${organization.name}</b> on NovoJuris!
      </p>
      <p>
        <b>Your login email:</b> ${email}<br/>
        <b>Temporary password:</b> ${password}
      </p>
      <p>
        <a href="" target="_blank" rel="noopener">Click here to log in</a> and set your own password after first sign-in.
      </p>
      <p>
        If you have any questions, please ask your organization admin.
      </p>
      <p>Welcome to the team!</p>
    `,
       });
       emailSent = true;
     } catch (err : any) {
       emailSent = false;
       emailError = err?.message || String(err);
       console.error("Invite email send error:", emailError);
     }


      res.json({
        success: true,
        message: emailSent
          ? "Employee account created successfully, invitation email sent"
          : "Employee account created, but failed to send email invitation",
        data: {
          employeeId: result.employee.id,
          name: result.employee.name,
          email: result.employee.email,
          role: result.orgEmployee.role,
          status: result.orgEmployee.status,
          emailSent,
          ...(emailError ? { emailError } : {}),
        },
      });
    } catch (error) {
      console.error("Create employee error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating employee account",
      });
    }
  }
);


// Get Employee Progress (requires org admin auth)
router.get(
  "/employee-progress/:employeeId",
  requireOrgAdmin,
  async (req: AuthedRequest, res: Response) => {
    try {
      const { employeeId } = req.params;
      const organizationId = req.user?.organizationId;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "Organization ID not found in user context",
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

// Get All Employees (requires org admin auth)
router.get(
  "/employees",
  requireOrgAdmin,
  async (req: AuthedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      const userId = req.user?.id;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "Organization ID not found in user context",
        });
      }

      const employees = await db.organizationUser.findMany({
        where: {
          organizationId,
          status: EmployeeStatus.ACTIVE,
          userId: { not: userId }, // Exclude admin
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              coinsEarned: true,
              createdAt: true,
            },
          },
        },
        orderBy: {
          joinedAt: "desc",
        },
      });

      const employeeList = employees.map((emp) => ({
        employeeId: emp.user.id,
        name: emp.user.name,
        email: emp.user.email,
        phone: emp.user.phone,
        role: emp.role,
        status: emp.status,
        coinsEarned: emp.user.coinsEarned,
        joinedAt: emp.joinedAt,
        createdAt: emp.user.createdAt,
      }));

      res.json({
        success: true,
        data: {
          employees: employeeList,
          totalEmployees: employeeList.length,
        },
      });
    } catch (error) {
      console.error("Get employees error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching employees",
      });
    }
  }
);

// Remove Employee (requires org admin auth)
router.delete(
  "/remove-employee/:employeeId",
  requireOrgAdmin,
  async (req: AuthedRequest, res: Response) => {
    try {
      const { employeeId } = req.params;
      const organizationId = req.user?.organizationId;
      const userId = req.user?.id;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "Organization ID not found in user context",
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
