import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthedRequest } from "../../middleware/admin";

const prisma = new PrismaClient();

// Get user wallet balance and transactions
export const getUserWallet = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { page = 1, limit = 10, type } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const skip = (Number(page) - 1) * Number(limit);

    // Build filter conditions for transactions
    const whereCondition: any = {
      wallet: { userId },
    };

    if (type && (type === "EARNED" || type === "REDEEMED")) {
      whereCondition.type = type;
    }

    // Get wallet balance
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      select: {
        id: true,
        balance: true,
        user: {
          select: {
            coinsEarned: true,
          },
        },
      },
    });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    // Get transactions with pagination
    const [transactions, totalTransactions] = await Promise.all([
      prisma.transaction.findMany({
        where: whereCondition,
        select: {
          id: true,
          type: true,
          amount: true,
          note: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(limit),
      }),
      prisma.transaction.count({
        where: whereCondition,
      }),
    ]);

    // Calculate statistics
    const [totalEarned, totalRedeemed] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          wallet: { userId },
          type: "EARNED",
        },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          wallet: { userId },
          type: "REDEEMED",
        },
        _sum: { amount: true },
      }),
    ]);

    // Format transactions for frontend
    const formattedTransactions = transactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      note: transaction.note,
      date: transaction.createdAt,
      formattedDate: new Date(transaction.createdAt).toLocaleDateString(
        "en-US",
        {
          day: "numeric",
          month: "long",
          year: "2-digit",
        }
      ),
    }));

    const walletData = {
      balance: wallet.balance,
      totalEarned: totalEarned._sum.amount || 0,
      totalRedeemed: totalRedeemed._sum.amount || 0,
      transactions: formattedTransactions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalTransactions,
        totalPages: Math.ceil(totalTransactions / Number(limit)),
      },
    };

    res.json({
      success: true,
      data: walletData,
      message: "Wallet data retrieved successfully",
    });
  } catch (error) {
    console.error("Error fetching wallet data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch wallet data",
    });
  }
};

// Get wallet statistics
export const getWalletStatistics = async (
  req: AuthedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Get comprehensive wallet statistics
    const [
      wallet,
      totalEarned,
      totalRedeemed,
      recentTransactions,
      monthlyEarnings,
    ] = await Promise.all([
      // Wallet balance
      prisma.wallet.findUnique({
        where: { userId },
        select: { balance: true },
      }),

      // Total earned
      prisma.transaction.aggregate({
        where: {
          wallet: { userId },
          type: "EARNED",
        },
        _sum: { amount: true },
      }),

      // Total redeemed
      prisma.transaction.aggregate({
        where: {
          wallet: { userId },
          type: "REDEEMED",
        },
        _sum: { amount: true },
      }),

      // Recent transactions (last 5)
      prisma.transaction.findMany({
        where: { wallet: { userId } },
        select: {
          id: true,
          type: true,
          amount: true,
          note: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),

      // Monthly earnings (last 6 months)
      prisma.transaction.groupBy({
        by: ["type"],
        where: {
          wallet: { userId },
          createdAt: {
            gte: new Date(new Date().setMonth(new Date().getMonth() - 6)),
          },
        },
        _sum: { amount: true },
      }),
    ]);

    const statistics = {
      currentBalance: wallet?.balance || 0,
      totalEarned: totalEarned._sum.amount || 0,
      totalRedeemed: totalRedeemed._sum.amount || 0,
      netEarnings:
        (totalEarned._sum.amount || 0) - (totalRedeemed._sum.amount || 0),
      recentTransactions: recentTransactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        note: tx.note,
        date: tx.createdAt,
      })),
      monthlyBreakdown: monthlyEarnings.reduce((acc, item) => {
        acc[item.type] = item._sum.amount || 0;
        return acc;
      }, {} as Record<string, number>),
    };

    res.json({
      success: true,
      data: statistics,
      message: "Wallet statistics retrieved successfully",
    });
  } catch (error) {
    console.error("Error fetching wallet statistics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch wallet statistics",
    });
  }
};
