import { Router, Request, Response } from "express";
import { db } from "../helper/db";
import jwt from "jsonwebtoken";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const { phone, otp, type } = req.body;

    if (!phone || !otp || !type) {
      return res.status(400).json({
        message: "Phone, OTP, and type are required",
      });
    }

    const user = await db.user.findUnique({
      where: { phone },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Update user as verified
    const updatedUser = await db.user.update({
      where: { phone },
      data: {
        isVerified: true,
        otp: null,
      },
    });

    if (type === "signIn") {
      // Generate JWT token
      const token = jwt.sign(
        { userId: updatedUser.id, phone: updatedUser.phone },
        process.env.JWT_SECRET as string,
        { expiresIn: "7d" }
      );

      return res.json({
        message: "Signed in successfully",
        token,
        user: updatedUser,
      });
    } else if (type === "register") {
      return res.json({
        message: "User created successfully",
        user: updatedUser,
      });
    } else {
      return res.status(400).json({
        message: "Invalid type provided. Must be 'signIn' or 'register'",
      });
    }
  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({
      message: "Internal server error during verification",
    });
  }
});

export default router;
