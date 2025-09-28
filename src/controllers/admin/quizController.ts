import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getQuizzes = async (req: Request, res: Response) => {
  console.log("GetQuizes Called", req.query);

  try {
    const { chapterId, isPublished } = req.query;
    const where: any = {};
    if (chapterId) where.chapterId = chapterId as string;
    if (isPublished !== undefined) where.isPublished = isPublished === "true";

    const quizzes = await prisma.quiz.findMany({
      where,
      include: {
        questions: {
          include: {
            options: true,
          },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(quizzes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch quizzes" });
  }
};

export const getQuizById = async (req: Request, res: Response) => {
  try {
    const quiz = await prisma.quiz.findUnique({
      where: { id: req.params.id },
      include: {
        questions: {
          include: {
            options: true,
          },
          orderBy: { order: "asc" },
        },
      },
    });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });
    res.json(quiz);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch quiz" });
  }
};

export const createQuiz = async (req: Request, res: Response) => {
  console.log("POST /api/quiz/quizzes called with body:", req.body);
  try {
    const { title, chapterId, passScore, duration, questions = [] } = req.body;

    if (!title || !chapterId || !passScore || !duration) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const orders = questions.map((q: any) => q.order);
    if (new Set(orders).size !== orders.length) {
      return res.status(400).json({ error: "Question orders must be unique" });
    }

    const quiz = await prisma.quiz.create({
      data: {
        title,
        chapterId,
        passScore,
        duration,
        questions: {
          create: questions.map((q: any) => ({
            text: q.text,
            imgUrl: q.imgUrl,
            order: q.order,
            options: {
              create:
                q.options?.map((o: any) => ({
                  text: o.text,
                  isCorrect: o.isCorrect ?? false,
                })) ?? [],
            },
          })),
        },
      },
      include: {
        questions: {
          include: { options: true },
        },
      },
    });
    res.status(201).json(quiz);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create quiz" });
  }
};

export const updateQuiz = async (req: Request, res: Response) => {
  try {
    const { title, coinValue, passScore, duration, isPublished, questions } =
      req.body;

    const updateData: any = {};
    if (title) updateData.title = title;
    if (coinValue !== undefined) updateData.coinValue = coinValue;
    if (passScore) updateData.passScore = passScore;
    if (duration) updateData.duration = duration;
    if (isPublished !== undefined) updateData.isPublished = isPublished;

    let quiz;
    if (questions) {
      await prisma.question.deleteMany({ where: { quizId: req.params.id } });

      quiz = await prisma.quiz.update({
        where: { id: req.params.id },
        data: {
          ...updateData,
          questions: {
            create: questions.map((q: any) => ({
              text: q.text,
              imgUrl: q.imgUrl,
              order: q.order,
              options: {
                create:
                  q.options?.map((o: any) => ({
                    text: o.text,
                    isCorrect: o.isCorrect ?? false,
                  })) ?? [],
              },
            })),
          },
        },
        include: {
          questions: {
            include: { options: true },
          },
        },
      });
    } else {
      quiz = await prisma.quiz.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          questions: {
            include: { options: true },
          },
        },
      });
    }

    if (!quiz) return res.status(404).json({ error: "Quiz not found" });
    res.json(quiz);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update quiz" });
  }
};

export const deleteQuiz = async (req: Request, res: Response) => {
  try {
    const quiz = await prisma.quiz.delete({
      where: { id: req.params.id },
    });
    res.json({ message: "Quiz deleted", quiz });
  } catch (error: any) {
    console.error(error);
    if (error.code === "P2025")
      return res.status(404).json({ error: "Quiz not found" });
    res.status(500).json({ error: "Failed to delete quiz" });
  }
};
