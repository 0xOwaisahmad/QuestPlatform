import { Router } from 'express';
import { z } from 'zod';
import * as authController from '../controllers/auth.controller';
import { validate } from '../middlewares/validate';
import { authLimiter } from '../middlewares/rateLimit';

const router = Router();

const getNonceSchema = z.object({
  query: z.object({
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Address"),
    projectId: z.string().uuid("Invalid Project ID"), // New requirement
  }),
});

const loginSchema = z.object({
  body: z.object({
    message: z.string(),
    signature: z.string(),
    projectId: z.string().uuid(),
    referral: z.string().optional(), // Added
  }),
});

router.get('/nonce', authLimiter, validate(getNonceSchema), authController.getNonce);
router.post('/verify', authLimiter, validate(loginSchema), authController.verifyAndLogin);

export default router;