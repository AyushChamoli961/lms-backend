import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "../helper/db";
const router = Router();

// Generate OTP
const generateOTP = (): string => {
  return crypto.randomInt(100000, 999999).toString();
};

router.post("/", async (req: Request, res: Response) => {
  try {
    console.log(req.body);
    const { phone, email, password } = req.body;

    // Validate required fields
    if (!email || !password || !phone) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }
    // Check if user already exists
    const existingUser = await db.user.findUnique({
      where: { email, phone },
    });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists with this email or phone number",
      });
    }

    // Generate the hash for the password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate the OTP for the user
    const otp = generateOTP();

    // Send the OTP to the user via email or SMS
    try {
    } catch (error) {
      console.error("Error sending OTP:", error);
      return res.status(500).json({
        message: "Failed to send OTP",
      });
    }

    const userData = {
      email,
      phone,
      password: hashedPassword,
      otp: "123456",
    };

    const data = await db.user.create({
      data: {
        ...userData,
      },
    });

    console.log("User data to be saved:", {
      data,
      password: "[HIDDEN]",
      otp: "[HIDDEN]",
    });

    // Return success response
    res.status(201).json({
      message:
        "User signed up successfully. Please verify your account with the OTP sent to your email/phone.",
      user: {
        email,
        phone: phone
          ? phone.replace(/(\d{3})\d{4}(\d{3})/, "$1****$2")
          : undefined,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({
      message: "Internal server error during signup",
    });
  }
});

export default router;
                                