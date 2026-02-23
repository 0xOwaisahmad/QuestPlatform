import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import { AppError } from '../utils/AppError';

export const getNonce = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = req.query.address as string;
    const projectId = req.query.projectId as string;
    
    // Validation is handled by Zod, but safe checks here
    if (!projectId) return next(new AppError('Project ID is required', 400));

    const nonce = await authService.generateAndSaveNonce(address, projectId);
    res.status(200).json({ status: 'success', nonce });
  } catch (error) {
    next(error);
  }
};

export const verifyAndLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message, signature, projectId, referral } = req.body;
    
    const result = await authService.verifyAndLoginUser(
      message, 
      signature, 
      projectId, 
      referral
    );
    
    res.status(200).json({ status: 'success', ...result });
  } catch (err: any) {
    const raw = err?.error ?? err;
    const msg =
      (typeof raw?.type === 'string' && raw.type) ||
      (typeof raw?.message === 'string' && raw.message) ||
      (err?.message && String(err.message)) ||
      'Authentication failed';
    next(new AppError(msg, err?.statusCode ?? 400));
  }
};