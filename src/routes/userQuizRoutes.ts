import { Router } from "express";
import {
  getQuizResult,
  getUserQuizHistory,
  submitQuizResult,
} from "../controllers/user/quizController";
import { requireAuth } from "../middleware/admin";

const router = Router();

router.post("/:quizId/result", requireAuth, submitQuizResult);

router.get("/:quizId/result", requireAuth, getQuizResult);

router.get("/history", requireAuth, getUserQuizHistory);

export default router;
