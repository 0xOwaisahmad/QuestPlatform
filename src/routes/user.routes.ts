import { Router } from 'express';
import { z } from 'zod';
import * as userController from '../controllers/user.controller';
import { protect } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';

const router = Router();

// Validation Schema
const linkSocialSchema = z.object({
  body: z.object({
    // Only allow specific column names from your DB
    platform: z.enum([
      "twitterId", 
      "telegramId", 
      "discordId", 
      "facebookId", 
      "instagramId"
    ], { 
      message: "Invalid platform. Must be twitterId, telegramId, etc." 
    }),
    username: z.string().min(1, "Username cannot be empty"),
  }),
});

// Protect all routes in this file
router.use(protect);

router.post('/link-social', validate(linkSocialSchema), userController.linkSocialProfile);

export default router;