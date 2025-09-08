import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";

interface JwtPayload {
  sub: string;
  role?: Role;
  email?: string;
  name?: string;
  iat?: number;
  exp?: number;
}

export interface AuthedRequest extends Request {
  user?: {
    id: string;
    role: Role;
    email?: string;
    name?: string;
    tokenPayload: JwtPayload;
  };
}

const ADMIN_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.L1_ADMIN,
  Role.L2_ADMIN,
  Role.USER,
];

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const parts = auth.split(" ");
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) return parts[1];
  return null;
}

export function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const token = extractToken(req);
  if (!token)
    return res.status(401).json({ success: false, message: "Missing token" });

  try {
    const secret = process.env.JWT_SECRET || "DEV_DUMMY_JWT_SECRET_CHANGE_ME";
    const payload = jwt.verify(token, secret) as JwtPayload;

    if (!payload.sub) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid token payload" });
    }

    req.user = {
      id: payload.sub,
      role: (payload.role as Role) || Role.USER,
      email: payload.email,
      name: payload.name,
      tokenPayload: payload,
    };

    return next();
  } catch (e) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
}

export function requireAdmin(allowedRoles: Role[] = ADMIN_ROLES) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res
        .status(500)
        .json({ success: false, message: "Auth middleware not applied" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ success: false, message: "Forbidden: admin role required" });
    }
    return next();
  };
}

// Optional helper for stricter tiers
export const requireSuperAdmin = requireAdmin([Role.SUPER_ADMIN]);
