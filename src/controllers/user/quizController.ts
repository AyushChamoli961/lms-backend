import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthedRequest } from "../../middleware/admin";

const prisma = new PrismaClient();

// Submit Quiz Result
export const submitQuizResult = async (req: AuthedRequest, res: Response) => {
  try {
    const { quizId } = req.params;
    const { score } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Validation
    if (!quizId || score === undefined || score < 0 || score > 100) {
      return res.status(400).json({
        success: false,
        message: "Invalid quiz ID or score",
      });
    }

    // Get quiz details to check pass score
    const quiz = await prisma.quiz.findFirst({
      where: {
        id: quizId,
      },
      include: {
        chapter: {
          select: {
            id: true,
            title: true,
            course: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
    });

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found or not published",
      });
    }

    const passed = score >= quiz.passScore;

    // Check if user already has a result for this quiz
    const existingResult = await prisma.quizResult.findUnique({
      where: {
        userId_quizId: {
          userId,
          quizId,
        },
      },
    });

    let quizResult;
    let coinsAwarded = 0;

    if (existingResult) {
      // Update existing result
      quizResult = await prisma.quizResult.update({
        where: {
          id: existingResult.id,
        },
        data: {
          score,
          passed,
          attemptedAt: new Date(),
        },
      });

      // Award coins if user passed and didn't pass before
      if (passed && !existingResult.passed && quiz.coinValue > 0) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            coinsEarned: {
              increment: quiz.coinValue,
            },
          },
        });

        // Use database transaction to ensure data consistency
        await prisma.$transaction(async (tx) => {
          // Get or create wallet for the user
          let wallet = await tx.wallet.findUnique({ where: { userId } });
          if (!wallet) {
            wallet = await tx.wallet.create({
              data: {
                userId,
                balance: 0,
              },
            });
          }

          // Add transaction record
          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              type: "EARNED",
              amount: quiz.coinValue,
              note: `Passed quiz: ${quiz.title}`,
            },
          });

          // Increment wallet balance
          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              balance: {
                increment: quiz.coinValue,
              },
            },
          });
        });

        coinsAwarded = quiz.coinValue;
      }
    } else {
      // Create new result
      quizResult = await prisma.quizResult.create({
        data: {
          userId,
          quizId,
          score,
          passed,
        },
      });

      // Award coins if user passed on first attempt
      if (passed && quiz.coinValue > 0) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            coinsEarned: {
              increment: quiz.coinValue,
            },
          },
        });

        // Use database transaction to ensure data consistency
        await prisma.$transaction(async (tx) => {
          // Get or create wallet for the user
          let wallet = await tx.wallet.findUnique({ where: { userId } });
          if (!wallet) {
            wallet = await tx.wallet.create({
              data: {
                userId,
                balance: 0,
              },
            });
          }

          // Add transaction record
          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              type: "EARNED",
              amount: quiz.coinValue,
              note: `Passed quiz: ${quiz.title}`,
            },
          });

          // Increment wallet balance
          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              balance: {
                increment: quiz.coinValue,
              },
            },
          });
        });

        coinsAwarded = quiz.coinValue;
      }
    }

    res.json({
      success: true,
      data: {
        id: quizResult.id,
        score: quizResult.score,
        passed: quizResult.passed,
        passScore: quiz.passScore,
        attemptedAt: quizResult.attemptedAt,
        coinsAwarded,
        quiz: {
          id: quiz.id,
          title: quiz.title,
          coinValue: quiz.coinValue,
          duration: quiz.duration,
        },
        chapter: quiz.chapter,
      },
      message: passed
        ? `Quiz passed! ${
            coinsAwarded > 0 ? `Earned ${coinsAwarded} coins.` : ""
          }`
        : "Quiz completed but not passed",
    });
  } catch (error) {
    console.error("Error submitting quiz result:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit quiz result",
    });
  }
};

// Get Quiz Result (for review)
export const getQuizResult = async (req: AuthedRequest, res: Response) => {
  try {
    const { quizId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const quizResult = await prisma.quizResult.findUnique({
      where: {
        userId_quizId: {
          userId,
          quizId,
        },
      },
      include: {
        quiz: {
          include: {
            questions: {
              include: {
                options: true,
              },
              orderBy: {
                order: "asc",
              },
            },
            chapter: {
              select: {
                id: true,
                title: true,
                course: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!quizResult) {
      return res.status(404).json({
        success: false,
        message: "Quiz result not found",
      });
    }

    res.json({
      success: true,
      data: {
        result: {
          id: quizResult.id,
          score: quizResult.score,
          passed: quizResult.passed,
          attemptedAt: quizResult.attemptedAt,
        },
        quiz: {
          id: quizResult.quiz.id,
          title: quizResult.quiz.title,
          passScore: quizResult.quiz.passScore,
          coinValue: quizResult.quiz.coinValue,
          duration: quizResult.quiz.duration,
          questions: quizResult.quiz.questions,
        },
        chapter: quizResult.quiz.chapter,
        canRetake: true,
      },
    });
  } catch (error) {
    console.error("Error fetching quiz result:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch quiz result",
    });
  }
};

// Get User's Quiz History
export const getUserQuizHistory = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { page = 1, limit = 10 } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const skip = (Number(page) - 1) * Number(limit);

    const results = await prisma.quizResult.findMany({
      where: {
        userId,
      },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            passScore: true,
            coinValue: true,
            chapter: {
              select: {
                id: true,
                title: true,
                course: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        attemptedAt: "desc",
      },
      skip,
      take: Number(limit),
    });

    const total = await prisma.quizResult.count({
      where: { userId },
    });

    res.json({
      success: true,
      data: results.map((result) => ({
        id: result.id,
        score: result.score,
        passed: result.passed,
        attemptedAt: result.attemptedAt,
        quiz: result.quiz,
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching quiz history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch quiz history",
    });
  }
};
