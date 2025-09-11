import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "../helper/db";
import { Role, EmployeeStatus } from "@prisma/client";

// Unified interface for authenticated requests
export interface AuthedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: Role;
    organizationId?: string;
  };
}

interface JwtPayload {
  sub: string;
  email?: string;
  name?: string;
  role?: Role;
  organizationId?: string;
  iat?: number;
  exp?: number;
}

// Helper function to extract token
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const parts = authHeader.split(" ");
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
    return parts[1];
  }
  return null;
}

// Basic authentication middleware
export const requireAuth = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token required",
      });
    }

    const secret = process.env.JWT_SECRET || "DEV_DUMMY_JWT_SECRET_CHANGE_ME";
    const decoded = jwt.verify(token, secret) as JwtPayload;

    console.log("JWT Payload:", decoded); // Debug log

    if (!decoded.sub) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload - missing user ID",
      });
    }

    // If token has complete user info, use it directly (for organization users)
    if (decoded.email && decoded.name) {
      req.user = {
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role || Role.USER,
        organizationId: decoded.organizationId,
      };

      console.log("Using token data directly:", req.user); // Debug log
      return next();
    }

    // Otherwise, fetch from database (for admin users)
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
        message: "Invalid authentication token - user not found",
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
      organizationId: decoded.organizationId,
    };

    console.log("Using database data:", req.user); // Debug log
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid authentication token",
    });
  }
};

// Organization admin middleware
export const requireOrgAdmin = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    console.log("requireOrgAdmin - req.user:", req.user); // Debug log

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const organizationId = req.user.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID required",
      });
    }

    // Check if user is organization admin
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
    console.log("Organization admin verified:", req.user); // Debug log
    next();
  } catch (error) {
    console.error("Org admin middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Authorization check failed",
    });
  }
};

// Organization member middleware
export const requireOrgMember = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    console.log("requireOrgMember - req.user:", req.user); // Debug log

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

     const organizationId = req.user.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID required",
      });
    }

    // Check if user is organization member
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
    console.log("Organization member verified:", req.user); // Debug log
    next();
  } catch (error) {
    console.error("Org member middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Authorization check failed",
    });
  }
};

// Admin roles for backward compatibility
const ADMIN_ROLES: Role[] = [Role.SUPER_ADMIN, Role.L1_ADMIN, Role.L2_ADMIN];

// Admin middleware for existing admin functionality
export function requireAdmin(allowedRoles: Role[] = ADMIN_ROLES) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(500).json({
        success: false,
        message: "Auth middleware not applied",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: admin role required",
      });
    }

    return next();
  };
}

// Helper for super admin only
export const requireSuperAdmin = requireAdmin([Role.SUPER_ADMIN]);
