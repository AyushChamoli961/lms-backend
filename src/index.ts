import express, { Request, Response } from "express";
import { signIn } from "./auth/signIn";
import register from "./auth/register";
import verifyOtp from "./auth/verifyOtp";
import courseRoutes from "./routes/courseRoutes";
import chapterRoutes from "./routes/chapterRoutes";
import videoRoutes from "./routes/videoRoutes";
import quizRoutes from "./routes/quizRoutes";
import fileUploadRoutes from "./routes/fileUploadRoutes";
import profileRoutes from "./routes/profileRoutes";
import walletRoutes from "./routes/walletRoutes";
import userCourseRoutes from "./routes/userCourseRoutes";
import userquizRoutes from "./routes/userQuizRoutes";

// Organization routes - separated by permission level
import publicOrgRoutes from "./routes/organisationRoutes";
import orgAdminRoutes from "./routes/organisationAdminRoutes";
import orgMemberRoutes from "./routes/organisationMember";

// Plan routes - separated by permission level
import publicPlanRoutes from "./routes/planRoutes";
import adminPlanRoutes from "./routes/planAdminRoutes";
import certificateRoutes from "./routes/certificateRoutes";
// Use the unified middleware
import {
  requireAuth,
  requireAdmin,
  requireSuperAdmin,
} from "./middleware/admin";

import enquiryRoutes from "./routes/enquiryRoutes";

import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global CORS headers middleware (applied before other middleware)
app.use((req, res, next) => {
  const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://lms-main-red.vercel.app",
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin as string)) {
    res.setHeader("Access-Control-Allow-Origin", origin as string);
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin"
  );

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://lms-main-red.vercel.app",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    exposedHeaders: ["Content-Length", "X-Kuma-Revision"],
    maxAge: 86400, // 24 hours
  })
);

// Handle preflight requests explicitly
app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin"
  );
  res.header("Access-Control-Allow-Credentials", "true");
  res.sendStatus(200);
});

// Basic route
app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Hey!, Zuperlearn Backend is Up!" });
});

// Auth routes (public)
app.use("/api/auth/signin", signIn);
app.use("/api/auth/register", register);
app.use("/api/auth/verifyOtp", verifyOtp);

//=======Enquiry Routes=========
app.use("/api/enquiry", enquiryRoutes);

// ===== ORGANIZATION ROUTES =====

// Public organization routes (no auth required)
app.use("/api/organizations/public", publicOrgRoutes);

// Organization admin routes (requires auth + org admin permissions)
app.use("/api/organizations/admin", requireAuth, orgAdminRoutes);

// Organization member routes (requires auth + org member permissions)
app.use("/api/organizations/member", requireAuth, orgMemberRoutes);

// ===== PLAN ROUTES =====

// Public plan routes (no auth required)
app.use("/api/plans", publicPlanRoutes);

// Admin plan routes (requires auth + admin permissions)
app.use("/api/plans/admin", requireAuth, adminPlanRoutes);

//========Certificates Routes =========
app.use("/api/certificates", certificateRoutes);

// ===== EXISTING ADMIN ROUTES =====
// These routes require admin authentication and specific admin roles
app.use("/api/courses", requireAuth, requireAdmin(), courseRoutes);
app.use("/api/chapters", requireAuth, requireAdmin(), chapterRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/files", fileUploadRoutes);

// ===== USER ROUTES =====
// These routes require basic authentication

// User course routes (protected with unified auth)
app.use("/api/user", requireAuth, userCourseRoutes);

// Profile routes (protected with unified auth)
app.use("/api/user/profile", requireAuth, profileRoutes);

// Wallet routes (protected with unified auth)
app.use("/api/user/wallet", requireAuth, walletRoutes);

// User quiz routes (protected with unified auth)
app.use("/api/user/quiz", requireAuth, userquizRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
