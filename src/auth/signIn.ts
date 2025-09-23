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

    // Find user by email with organization membership
    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        otp: true,
        isVerified: true,
        organizationMembership: {
          select: {
            organizationId: true,
            role: true,
          },
        },
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

    // Generate JWT token with organization ID
    const secret = process.env.JWT_SECRET || "DEV_DUMMY_JWT_SECRET_CHANGE_ME";
    const tokenPayload: any = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    // Add organization ID if user is part of an organization
    if (user.organizationMembership) {
      tokenPayload.organizationId = user.organizationMembership.organizationId;
      tokenPayload.orgRole = user.organizationMembership.role;
    }

    const token = jwt.sign(tokenPayload, secret, { expiresIn: "30d" });

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
          organizationId: user.organizationMembership?.organizationId || null,
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

// Forgot Password - Reset password directly with email verification
router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email, newPassword } = req.body;

    // Validate input
    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email and new password are required",
      });
    }

    // Validate password strength (you can customize this)
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
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
      // For security reasons, don't reveal if email exists or not
      return res.json({
        success: true,
        message:
          "If an account with this email exists, the password has been reset",
        data: {
          email,
        },
      });
    }

    // Hash the new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update user password and mark as verified
    await db.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        otp: null, // Clear any existing OTP
        isVerified: true, // Mark as verified since they proved email ownership
      },
    });

    res.json({
      success: true,
      message: "Password reset successfully",
      data: {
        email: user.email,
        message: "You can now sign in with your new password",
      },
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while processing forgot password request",
    });
  }
});

// Reset Password - Change password with current password verification
router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    // Validate input
    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, current password, and new password are required",
      });
    }

    // Validate password strength (you can customize this)
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long",
      });
    }

    // Find user by email
    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found with this email",
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password!
    );
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Check if new password is different from current password
    const isSamePassword = await bcrypt.compare(newPassword, user.password!);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from current password",
      });
    }

    // Hash the new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update user password
    await db.user.update({
      where: { email },
      data: {
        password: hashedPassword,
      },
    });

    res.json({
      success: true,
      message: "Password changed successfully",
      data: {
        email: user.email,
        message: "Your password has been updated",
      },
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while resetting password",
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

    // Find user by email with organization membership
    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        role: true,
        isVerified: true,
        organizationMembership: {
          select: {
            organizationId: true,
            role: true,
            status: true,
          },
        },
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

    // Check organization membership status if applicable
    if (
      user.organizationMembership &&
      user.organizationMembership.status !== "ACTIVE"
    ) {
      return res.status(401).json({
        success: false,
        message: "Your organization account is not active",
      });
    }

    // Generate JWT token with organization ID
    const secret = process.env.JWT_SECRET || "DEV_DUMMY_JWT_SECRET_CHANGE_ME";
    const tokenPayload: any = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    // Add organization ID and org role if user is part of an organization
    if (user.organizationMembership) {
      tokenPayload.organizationId = user.organizationMembership.organizationId;
      tokenPayload.orgRole = user.organizationMembership.role;
    }

    const token = jwt.sign(tokenPayload, secret, { expiresIn: "30d" });

    // Remove password from response
    const {
      password: _,
      organizationMembership,
      ...userWithoutPassword
    } = user;

    res.json({
      success: true,
      message: "Sign-in successful",
      user: {
        ...userWithoutPassword,
        organizationId: organizationMembership?.organizationId || null,
        orgRole: organizationMembership?.role || null,
        orgStatus: organizationMembership?.status || null,
      },
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
