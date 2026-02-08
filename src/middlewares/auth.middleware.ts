import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';
import { prisma } from '../config/prisma';
import { Role } from '@prisma/client';

interface JwtPayload {
  walletAddress: string;
  projectId: string; // New field in JWT
}

export const protect = (req: Request, res: Response, next: NextFunction) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('You are not logged in. Please log in to get access.', 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    
    req.user = { walletAddress: decoded.walletAddress };
    req.project = { id: decoded.projectId }; // Attach Project Context
    
    next();
  } catch (err) {
    return next(new AppError('Invalid or expired token', 401));
  }
};

export const restrictTo = (...roles: Role[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // 1. Ensure user is logged in (req.user is set by protect middleware)
    if (!req.user) {
      return next(new AppError('You are not logged in.', 401));
    }

    // 2. Fetch full user to check Role
    // (req.user from JWT might be stale, so safer to fetch from DB for critical Admin actions)
    const user = await prisma.user.findUnique({ 
        where: { walletAddress: req.user.walletAddress } 
    });

    if (!user || !roles.includes(user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }

    next();
  };
};