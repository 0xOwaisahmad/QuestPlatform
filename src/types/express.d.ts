import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        walletAddress: string;
        role?: string;
        projectId?: string;
      };
      project?: {
        id: string;
      };
    }
  }
}