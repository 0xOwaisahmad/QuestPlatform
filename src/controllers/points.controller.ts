import { Request, Response, NextFunction } from 'express';
import * as pointsService from '../services/points.service';

export const getTotalPoints = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Extracted from Token
    const projectId = req.project!.id; 
    const { walletAddress } = req.user!; 
    
    const points = await pointsService.getUserPointsBalance(walletAddress, projectId);
    
    res.status(200).json({ status: 'success', data: { totalPoints: points } });
  } catch (error) {
    next(error);
  }
};


export const getRank = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = req.project!.id;
    const { walletAddress } = req.user!;

    const result = await pointsService.getUserRank(walletAddress, projectId);

    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};


export const getLeaderboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Types are guaranteed by Zod transform
    const projectId = req.query.projectId as string;
    const page = Number(req.query.page);
    const limit = Number(req.query.limit);

    // Limit the maximum page size to prevent heavy DB load
    const safeLimit = limit > 100 ? 100 : limit;

    const result = await pointsService.getLeaderboardData(projectId, page, safeLimit);

    res.status(200).json({ 
      status: 'success', 
      page, 
      limit: safeLimit, 
      results: result.length, 
      data: result 
    });
  } catch (error) {
    next(error);
  }
};