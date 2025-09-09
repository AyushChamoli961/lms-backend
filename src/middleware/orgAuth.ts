import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "../helper/db";
import { Role, EmployeeStatus } from "@prisma/client";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: Role;
    organizationId?: string;
  };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token required",
      });
    }

    const secret = process.env.JWT_SECRET || "DEV_DUMMY_JWT_SECRET_CHANGE_ME";
    const decoded = jwt.verify(token, secret) as any;

    const user = await db.user.findUnique({
      where: { id: decoded.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token",
      });
    }

    // Handle null values from database
    if (!user.email || !user.name) {
      return res.status(401).json({
        success: false,
        message: "User account incomplete",
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid authentication token",
    });
  }
};

export const requireOrgAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const organizationId = req.params.organizationId || req.body.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID required",
      });
    }

    const orgUser = await db.organizationUser.findFirst({
      where: {
        organizationId,
        userId: req.user.id,
        role: Role.ORG_ADMIN,
        status: EmployeeStatus.ACTIVE,
      },
    });

    if (!orgUser) {
      return res.status(403).json({
        success: false,
        message: "Organization admin access required",
      });
    }

    req.user.organizationId = organizationId;
    next();
  } catch (error) {
    console.error("Org admin middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Authorization check failed",
    });
  }
};

export const requireOrgMember = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const organizationId = req.params.organizationId || req.body.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID required",
      });
    }

    const orgUser = await db.organizationUser.findFirst({
      where: {
        organizationId,
        userId: req.user.id,
        status: EmployeeStatus.ACTIVE,
      },
    });

    if (!orgUser) {
      return res.status(403).json({
        success: false,
        message: "Organization membership required",
      });
    }

    req.user.organizationId = organizationId;
    next();
  } catch (error) {
    console.error("Org member middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Authorization check failed",
    });
  }
};
