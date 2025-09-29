import { Router, Request, Response } from "express";
import { db } from "../helper/db";

const router = Router();

// Get all active plans (public endpoint)
router.get("/", async (req: Request, res: Response) => {
  try {
    const plans = await db.plan.findMany({
      where: { isActive: true },
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
    console.error("Get plans error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching plans",
    });
  }
});



export default router;
