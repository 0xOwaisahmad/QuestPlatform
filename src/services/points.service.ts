import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';

export const getUserPointsBalance = async (walletAddress: string, projectId: string) => {
  const record = await prisma.userPoints.findUnique({
    where: {
      walletAddress_projectId: {
        walletAddress,
        projectId,
      },
    },
  });

  return record ? record.totalPoints : 0;
};

// --- NEW FUNCTION ---
export const getUserRank = async (walletAddress: string, projectId: string) => {
  // 1. Get Current User's Stats
  const userRecord = await prisma.userPoints.findUnique({
    where: {
      walletAddress_projectId: {
        walletAddress,
        projectId,
      },
    },
    select: {
      totalPoints: true,
      createdAt: true // We need this for the tie-breaker
    }
  });

  if (!userRecord) {
     return { rank: 0, totalPoints: 0 }; // Or throw error if you prefer
  }

  // 2. Count how many users are "better" than this user
  // "Better" means: Higher Points OR (Same Points AND Joined Earlier)
  const betterPlayersCount = await prisma.userPoints.count({
    where: {
      projectId: projectId,
      OR: [
        {
          totalPoints: { gt: userRecord.totalPoints }
        },
        {
          totalPoints: userRecord.totalPoints,
          createdAt: { lt: userRecord.createdAt }
        }
      ]
    }
  });

  // Rank is simply the count of better players + 1 (yourself)
  return { 
    rank: betterPlayersCount + 1, 
    totalPoints: userRecord.totalPoints 
  };
};


export const getLeaderboardData = async (projectId: string, page: number, limit: number) => {
  const skip = (page - 1) * limit;

  const users = await prisma.userPoints.findMany({
    where: { projectId },
    // Sort logic: Highest points first. If tie, earliest joiner wins.
    orderBy: [
      { totalPoints: 'desc' },
      { createdAt: 'asc' }
    ],
    skip: skip,
    take: limit,
    // Join with User table to get display names
    include: {
      user: {
        select: {
          profileName: true,
          realName: true,
          // Add other profile fields if needed
        }
      }
    }
  });

  // Map results to add specific 'rank' number to the response
  return users.map((u: any, index: number) => ({
    rank: skip + index + 1, // Calculate absolute rank
    walletAddress: u.walletAddress,
    profileName: u.user.profileName, // Flattened structure
    totalPoints: u.totalPoints,
  }));
};