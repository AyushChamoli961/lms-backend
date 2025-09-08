import { Router, Request, Response } from "express";
import { db } from "../helper/db";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const router = Router();

// Static OTP for dummy usage
const STATIC_OTP = "123456";

// Send OTP for email verification
router.post("/send-otp", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Validate input
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Check if user exists
    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found with this email",
      });
    }

    // Update user with OTP (for dummy usage, we'll store the static OTP)
    await db.user.update({
      where: { email },
      data: {
        otp: STATIC_OTP,
      },
    });

    // In a real implementation, you would send this OTP via email/SMS
    // For dummy usage, we'll return it in the response
    res.json({
      success: true,
      message: "OTP sent successfully",
      data: {
        email: user.email,
        otp: STATIC_OTP, // Remove this in production
        message: "For dummy usage, OTP is: 123456",
      },
    });
  } catch (error) {
    console.error("Send OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while sending OTP",
    });
  }
});

// Verify OTP
router.post("/verify-otp", async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    // Validate input
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    // Find user by email
    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        otp: true,
        isVerified: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found with this email",
      });
    }

    // Check if OTP matches
    if (user.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    // Mark user as verified and clear OTP
    await db.user.update({
      where: { email },
      data: {
        isVerified: true,
        otp: null,
      },
    });

    // Generate JWT token
    const secret = process.env.JWT_SECRET || "DEV_DUMMY_JWT_SECRET_CHANGE_ME";
    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      secret,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      message: "OTP verified successfully",
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isVerified: true,
        },
        token,
      },
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while verifying OTP",
    });
  }
});

// Actual email/password sign-in with database validation
router.post("/", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find user by email
    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        role: true,
        isVerified: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if user is verified
    // if (!user.isVerified) {
    //   return res.status(401).json({
    //     success: false,
    //     message: "Please verify your email before signing in",
    //   });
    // }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password!);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Generate JWT token
    const secret = process.env.JWT_SECRET || "DEV_DUMMY_JWT_SECRET_CHANGE_ME";
    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      secret,
      { expiresIn: "30d" }
    );

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      message: "Sign-in successful",
      user: userWithoutPassword,
      token,
    });
  } catch (error) {
    console.error("Sign-in error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during sign-in",
    });
  }
});

export { router as signIn };
