import { Router, Response } from "express";
import { db } from "../helper/db";
import { EmployeeStatus } from "@prisma/client";
import { AuthedRequest, requireOrgMember } from "../middleware/admin";

const router = Router();

// Organization Dashboard (requires org membership)
router.get(
  "/dashboard/:organizationId",
  requireOrgMember,
  async (req: AuthedRequest, res: Response) => {
    try {
      const { organizationId } = req.params;

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

export default router;
