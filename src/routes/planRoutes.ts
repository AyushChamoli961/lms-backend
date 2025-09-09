import { Router, Request, Response } from "express";
import { db } from "../helper/db";
import { PlanType } from "@prisma/client";

const router = Router();

// Get all active plans (public endpoint)
router.get("/", async (req: Request, res: Response) => {
  try {
    const plans = await db.plan.findMany({
      where: { isActive: true },
      orderBy: [{ type: "asc" }, { price: "asc" }],
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

// Create plan (admin only)
router.post("/", async (req: Request, res: Response) => {
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
});

// Update plan (admin only)
router.put("/:planId", async (req: Request, res: Response) => {
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
});

export default router;
