import { Router, Request, Response } from "express";
import { db } from "../helper/db";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { Role, EmployeeStatus } from "@prisma/client";

const router = Router();

// Organization Registration (public)
router.post("/register", async (req: Request, res: Response) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      website,
      adminName,
      adminEmail,
      adminPhone,
      password,
    } = req.body;

    // Validate required fields
    if (!name || !email || !adminName || !adminEmail || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Organization name, email, admin name, admin email, and password are required",
      });
    }

    // Check if organization already exists
    const existingOrg = await db.organization.findUnique({
      where: { email },
    });

    if (existingOrg) {
      return res.status(400).json({
        success: false,
        message: "Organization already exists with this email",
      });
    }

    // Check if admin user already exists
    const existingAdmin = await db.user.findUnique({
      where: { email: adminEmail },
    });

    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this admin email",
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create organization and admin user in transaction
    const result = await db.$transaction(async (tx) => {
      // Create organization
      const organization = await tx.organization.create({
        data: {
          name,
          email,
          phone,
          address,
          website,
          isActive: true,
        },
      });

      // Create admin user
      const adminUser = await tx.user.create({
        data: {
          name: adminName,
          email: adminEmail,
          phone: adminPhone,
          password: hashedPassword,
          role: Role.ORG_ADMIN,
          isVerified: true, // Auto-verify org admin
        },
      });

      // Link admin to organization
      await tx.organizationUser.create({
        data: {
          organizationId: organization.id,
          userId: adminUser.id,
          role: Role.ORG_ADMIN,
          status: EmployeeStatus.ACTIVE,
        },
      });

      return { organization, adminUser };
    });

    // Generate JWT token for admin
    const secret = process.env.JWT_SECRET || "DEV_DUMMY_JWT_SECRET_CHANGE_ME";
    const token = jwt.sign(
      {
        sub: result.adminUser.id,
        email: result.adminUser.email,
        name: result.adminUser.name,
        role: result.adminUser.role,
        organizationId: result.organization.id,
      },
      secret,
      { expiresIn: "30d" }
    );

    res.status(201).json({
      success: true,
      message: "Organization registered successfully",
      data: {
        organization: result.organization,
        admin: {
          id: result.adminUser.id,
          name: result.adminUser.name,
          email: result.adminUser.email,
          role: result.adminUser.role,
        },
        token,
      },
    });
  } catch (error) {
    console.error("Organization registration error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during registration",
    });
  }
});

// Accept Invitation (public - for backward compatibility)
router.post("/accept-invitation", async (req: Request, res: Response) => {
  try {
    const { token, name, password } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Invitation token is required",
      });
    }

    // Find valid invitation
    const invitation = await db.invitation.findUnique({
      where: { token },
      include: {
        organization: true,
        invitedUser: true,
      },
    });

    if (
      !invitation ||
      invitation.isAccepted ||
      invitation.expiresAt < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired invitation",
      });
    }

    let user = invitation.invitedUser;

    // If user doesn't exist, create new user
    if (!user) {
      if (!name || !password) {
        return res.status(400).json({
          success: false,
          message: "Name and password are required for new users",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      user = await db.user.create({
        data: {
          name,
          email: invitation.email,
          password: hashedPassword,
          role: invitation.role,
          isVerified: true,
        },
      });
    }

    // Accept invitation and create organization user relationship
    await db.$transaction(async (tx) => {
      // Mark invitation as accepted
      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          isAccepted: true,
          acceptedAt: new Date(),
          invitedUserId: user!.id,
        },
      });

      // Create organization user relationship
      await tx.organizationUser.create({
        data: {
          organizationId: invitation.organizationId,
          userId: user!.id,
          role: invitation.role,
          status: EmployeeStatus.ACTIVE,
        },
      });

      // Update subscription employee count
      if (invitation.organization.currentPlanId) {
        await tx.subscription.update({
          where: { id: invitation.organization.currentPlanId },
          data: {
            employeeCount: { increment: 1 },
          },
        });
      }
    });

    // Generate JWT token
    const secret = process.env.JWT_SECRET || "DEV_DUMMY_JWT_SECRET_CHANGE_ME";
    const jwtToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: invitation.organizationId,
      },
      secret,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      message: "Invitation accepted successfully",
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        organization: invitation.organization,
        token: jwtToken,
      },
    });
  } catch (error) {
    console.error("Accept invitation error:", error);
    res.status(500).json({
      success: false,
      message: "Error accepting invitation",
    });
  }
});



// Organization Login (public)
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find user by email
    const user = await db.user.findUnique({
      where: { email },
      include: {
        organizationMembership: {
          include: {
            organization: true,
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

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password || '');
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if user is verified
    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        message: "Please verify your account first",
      });
    }

    // Check if user belongs to an organization
    if (!user.organizationMembership) {
      return res.status(401).json({
        success: false,
        message: "User is not associated with any organization",
      });
    }

    // Check if user has active status
    if (user.organizationMembership.status !== EmployeeStatus.ACTIVE) {
      return res.status(401).json({
        success: false,
        message: "User account is not active in the organization",
      });
    }

    // Check if organization is active
    if (!user.organizationMembership.organization.isActive) {
      return res.status(401).json({
        success: false,
        message: "Organization is not active",
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
        organizationId: user.organizationMembership.organizationId,
      },
      secret,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        organization: {
          id: user.organizationMembership.organization.id,
          name: user.organizationMembership.organization.name,
          email: user.organizationMembership.organization.email,
        },
        token,
      },
    });
  } catch (error) {
    console.error("Organization login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during login",
    });
  }
});


export default router;
