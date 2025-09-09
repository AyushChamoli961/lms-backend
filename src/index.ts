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

// Organization routes
import organizationController from "./routes/organisationController";
import planRoutes from "./routes/planRoutes";

import { requireAuth, requireAdmin } from "./middleware/admin";
import { requireAuth as requireOrgAuth } from "./middleware/orgAuth";
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

// Auth routes
app.use("/api/auth/signin", signIn);
app.use("/api/auth/register", register);
app.use("/api/auth/verifyOtp", verifyOtp);

// Organization routes
app.use("/api/organizations", organizationController);
app.use("/api/plans", planRoutes);

// API routes (existing)
app.use("/api/courses", requireAuth, courseRoutes);
app.use("/api/chapters", requireAuth, chapterRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/files", fileUploadRoutes);

// User course routes (no admin auth required)
app.use("/api/user", userCourseRoutes);

// Profile routes
app.use("/api/user/profile", profileRoutes);

// Wallet routes
app.use("/api/user/wallet", walletRoutes);

// User quiz routes
app.use("/api/user/quiz", userquizRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
