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
import summaryRoutes from "./routes/summaryRoutes";
import { adminRoutes } from "./routes/adminUserRoutes";
// Organization routes - separated by permission level
import publicOrgRoutes from "./routes/organisationRoutes";
import orgAdminRoutes from "./routes/organisationAdminRoutes";
import orgMemberRoutes from "./routes/organisationMember";
import adminOrgRoutes from "./routes/orgManagementRoutes";
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
    "https://lms-admin-one-cyan.vercel.app",
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
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

// Handle preflight requests explicitly for all routes
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
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
    return res.sendStatus(200);
  }
  next();
});

// Basic route
app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Hey!, Zuperlearn Backend is Up!" });
});

// Auth routes (public)
app.use("/api/auth/signin", signIn);
app.use("/api/auth/register", register);
app.use("/api/auth/verifyOtp", verifyOtp);
app.use("/api/admin/organizations", requireAuth, adminOrgRoutes);
app.use("/api/admin", adminRoutes);
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

// Handle favicon and other static file requests
app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

app.get("/favicon.png", (req, res) => {
  res.status(204).end();
});

// Catch-all route for undefined endpoints
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
    path: req.path,
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
