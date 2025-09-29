import { Router, Request, Response } from "express";
import { db } from "../helper/db";
import { PlanType, Role } from "@prisma/client";
import { AuthedRequest, requireAdmin } from "../middleware/admin";

const router = Router();

// Create plan (admin only)
router.post(
  "/",
  requireAdmin([Role.SUPER_ADMIN, Role.L1_ADMIN]),
  async (req: AuthedRequest, res: Response) => {
    try {
      const {
        name,
        description,
        type,
        maxEmployees,
        price,
        billingCycle = "monthly",
        features = [],
      } = req.body;

      if (!name || !type || !maxEmployees || !price) {
        return res.status(400).json({
          success: false,
          message: "Name, type, maxEmployees, and price are required",
        });
      }

      const plan = await db.plan.create({
        data: {
          name,
          description,
          type: type as PlanType,
          maxEmployees,
          price,
          billingCycle,
          features,
          isActive: true,
        },
      });

      res.status(201).json({
        success: true,
        message: "Plan created successfully",
        data: plan,
      });
    } catch (error) {
      console.error("Create plan error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating plan",
      });
    }
  }
);

// Get all plans for admin (including inactive ones)
router.get(
  "/",
  requireAdmin([Role.SUPER_ADMIN, Role.L1_ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const plans = await db.plan.findMany({
        include: {
          _count: {
            select: {
              subscriptions: true,
            },
          },
        },
        orderBy: [{ type: "asc" }, { price: "asc" }],
      });

      res.json({
        success: true,
        data: plans,
      });
    } catch (error) {
      console.error("Get admin plans error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching plans",
      });
    }
  }
);

// Update plan (admin only)
router.put(
  "/:planId",
  requireAdmin([Role.SUPER_ADMIN, Role.L1_ADMIN]),
  async (req: AuthedRequest, res: Response) => {
    try {
      const { planId } = req.params;
      const updateData = req.body;

      const plan = await db.plan.update({
        where: { id: planId },
        data: updateData,
      });

      res.json({
        success: true,
        message: "Plan updated successfully",
        data: plan,
      });
    } catch (error) {
      console.error("Update plan error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating plan",
      });
    }
  }
);

// Delete/Deactivate plan (admin only)
router.delete(
  "/:planId",
  requireAdmin([Role.SUPER_ADMIN]),
  async (req: AuthedRequest, res: Response) => {
    try {
      const { planId } = req.params;

      const plan = await db.plan.update({
        where: { id: planId },
        data: { isActive: false },
      });

      res.json({
        success: true,
        message: "Plan deactivated successfully",
        data: plan,
      });
    } catch (error) {
      console.error("Delete plan error:", error);
      res.status(500).json({
        success: false,
        message: "Error deactivating plan",
      });
    }
  }
);

export default router;
