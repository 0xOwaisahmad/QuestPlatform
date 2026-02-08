import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';

// Define the allowed fields strictly for TypeScript safety
const ALLOWED_PLATFORMS = [
  'twitterId', 
  'telegramId', 
  'discordId', 
  'facebookId', 
  'instagramId'
] as const;

type SocialPlatform = typeof ALLOWED_PLATFORMS[number];

export const linkSocialProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { platform, username } = req.body;
    const { walletAddress } = req.user!;

    // 1. Fetch current user data
    const user = await prisma.user.findUnique({
      where: { walletAddress },
    });

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    // 2. Check if this specific platform is already linked
    // We treat the platform string as a key of the User model
    if (user[platform as SocialPlatform]) {
      return next(new AppError(`You have already linked a ${platform} account.`, 400));
    }

    // 3. Update the user record
    await prisma.user.update({
      where: { walletAddress },
      data: {
        [platform]: username, 
      },
    });

    res.status(200).json({
      status: 'success',
      message: `${platform} linked successfully.`,
    });

  } catch (error) {
    next(error);
  }
};