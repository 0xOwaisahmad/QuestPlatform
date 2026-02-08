import { Router } from 'express';
import { z } from 'zod';
import * as tasksController from '../controllers/tasks.controller';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import { Role } from '@prisma/client';

const router = Router();

// 1. Validation Schemas
const publicProjectQuery = z.object({
  query: z.object({
    projectId: z.string().uuid(),
  }),
});

const completeTaskSchema = z.object({
  body: z.object({
    taskId: z.string().uuid({ message: "Invalid Task ID format" }),
  }),
});

const createTaskSchema = z.object({
  body: z.object({
    projectId: z.string().uuid(),
    type: z.string().min(1, "Type is required"),
    taskUrl: z.string().url().optional().or(z.literal("")), // Optional URL
    message: z.string().min(1, "Message is required"),
    socialMediaName: z.string().min(1, "Social Media Name is required"),
    points: z.number().int().positive("Points must be positive"),
    time: z.number().int().nonnegative("Time must be a valid timestamp"), // 0 = infinite
  }),
});

const verifyTaskSchema = z.object({
  body: z.object({
    userTaskId: z.string().uuid(),
    status: z.enum(['COMPLETED', 'REJECTED'], { 
      message: "Status must be 'COMPLETED' or 'REJECTED'" 
    }),
  }),
});

// 2. Public Routes (No JWT needed)
router.get('/active', validate(publicProjectQuery), tasksController.getActiveTasks);

// 3. Protected Routes (JWT required)
router.use(protect);

// Notice: No schemas needed for pending/status since inputs come from JWT
router.post(
  '/pending', 
  tasksController.getPendingTasks
);
router.get(
  '/user-status', 
  tasksController.getUserTaskStatus
); 
router.post(
  '/complete',
  validate(completeTaskSchema), 
  tasksController.requestTaskCompletion
);
router.post(
  '/create', 
  restrictTo(Role.ADMIN), // Only ADMIN can access
  validate(createTaskSchema), 
  tasksController.createTask
);

router.post(
  '/verify', 
  restrictTo(Role.ADMIN), // Admin Only
  validate(verifyTaskSchema), 
  tasksController.verifyUserTask
);


export default router;