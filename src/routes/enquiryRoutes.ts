import { Router, Response } from "express";
import { db } from "../helper/db";
import { Role, PlanStatus } from "@prisma/client";
import { AuthedRequest, requireAuth, requireAdmin } from "../middleware/admin";

const router = Router();

// Assign Plan to Organization (Super Admin only)
router.post(
  "/assign-plan-to-org",
  requireAuth,
  requireAdmin([Role.SUPER_ADMIN, Role.L1_ADMIN]),
  async (req: AuthedRequest, res: Response) => {
    try {
      const {
        organizationId,
        planId,
        startDate,
        endDate,
        billingCycle = "monthly",
        autoRenew = true,
        customEmployeeLimit,
      } = req.body;

      if (!organizationId || !planId) {
        return res.status(400).json({
          success: false,
          message: "Organization ID and Plan ID are required",
        });
      }

      // Verify organization exists and is active
      const organization = await db.organization.findUnique({
        where: { id: organizationId },
        include: {
          employees: {
            where: {
              status: "ACTIVE",
            },
          },
          currentPlan: true,
        },
      });

      if (!organization) {
        return res.status(404).json({
          success: false,
          message: "Organization not found",
        });
      }

      if (!organization.isActive) {
        return res.status(400).json({
          success: false,
          message: "Organization is not active",
        });
      }

      // Verify plan exists and is active
      const plan = await db.plan.findUnique({
        where: { id: planId },
      });

      if (!plan || !plan.isActive) {
        return res.status(404).json({
          success: false,
          message: "Plan not found or inactive",
        });
      }

      // Calculate dates if not provided
      const subscriptionStartDate = startDate
        ? new Date(startDate)
        : new Date();

      // Fix: Explicitly type subscriptionEndDate as Date
      let subscriptionEndDate: Date;

      if (endDate) {
        subscriptionEndDate = new Date(endDate);
      } else {
        subscriptionEndDate = new Date(subscriptionStartDate);
        if (billingCycle === "yearly") {
          subscriptionEndDate.setFullYear(
            subscriptionEndDate.getFullYear() + 1
          );
        } else {
          subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);
        }
      }

      // Determine employee limit (custom override or plan default)
      const employeeLimit = customEmployeeLimit || plan.maxEmployees;

      // Get current employee count (excluding admin)
      const currentEmployeeCount = organization.employees.length;

      // Check if current employees exceed new plan limit
      if (currentEmployeeCount > employeeLimit) {
        return res.status(400).json({
          success: false,
          message: `Current employee count (${currentEmployeeCount}) exceeds plan limit (${employeeLimit})`,
          suggestion: `Consider upgrading plan or use customEmployeeLimit parameter`,
        });
      }

      const result = await db.$transaction(async (tx) => {
        // Deactivate current subscription if exists
        if (organization.currentPlan) {
          await tx.subscription.update({
            where: { id: organization.currentPlan.id },
            data: {
              status: PlanStatus.INACTIVE,
            },
          });
        }

        // Create new subscription
        const subscription = await tx.subscription.create({
          data: {
            organizationId,
            planId,
            status: PlanStatus.ACTIVE,
            startDate: subscriptionStartDate,
            endDate: subscriptionEndDate,
            employeeLimit: employeeLimit,
            employeeCount: currentEmployeeCount,
            autoRenew: autoRenew,
          },
          include: {
            plan: {
              select: {
                id: true,
                name: true,
                type: true,
                price: true,
                billingCycle: true,
                maxEmployees: true,
                features: true,
              },
            },
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
        message: "Plan assigned to organization successfully",
        data: {
          subscriptionId: result.id,
          organizationId: organization.id,
          organizationName: organization.name,
          plan: result.plan,
          status: result.status,
          startDate: result.startDate,
          endDate: result.endDate,
          employeeLimit: result.employeeLimit,
          currentEmployeeCount: result.employeeCount,
          autoRenew: result.autoRenew,
          utilizationPercentage: Math.round(
            (result.employeeCount / result.employeeLimit) * 100
          ),
        },
      });
    } catch (error) {
      console.error("Assign plan to organization error:", error);
      res.status(500).json({
        success: false,
        message: "Error assigning plan to organization",
      });
    }
  }
);


export default router