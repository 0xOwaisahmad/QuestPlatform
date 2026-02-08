import { Router } from 'express';
import { z } from 'zod';
import * as pointsController from '../controllers/points.controller';
import { protect } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';

const router = Router();

// Validation for Public Leaderboard
const leaderboardSchema = z.object({
  query: z.object({
    projectId: z.string().uuid(),
    page: z.string().regex(/^\d+$/).transform(Number).default("1"),
    limit: z.string().regex(/^\d+$/).transform(Number).default("20"),
  }),
});

// --- Public Routes ---
router.get('/leaderboard', validate(leaderboardSchema), pointsController.getLeaderboard);

// --- Protected Routes ---
router.use(protect);
router.post('/total', pointsController.getTotalPoints);
router.get('/rank', pointsController.getRank);

export default router;