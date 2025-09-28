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
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
