import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { addTaskToQueue } from '../queue/task.queue';
import * as tasksService from '../services/tasks.service';
import { AppError } from '../utils/AppError';
import redis from '../config/redis';
import { Status } from '@prisma/client';
import { TaskStatus } from '@prisma/client';

// PUBLIC (Uses req.query.projectId)
export const getActiveTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = req.query.projectId as string;
    const tasks = await tasksService.getActiveTasksForProject(projectId);
    res.status(200).json({ status: 'success', results: tasks.length, data: tasks });
  } catch (error) {
    next(error);
  }
};

// PROTECTED (Uses req.project!.id)
export const getUserTaskStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = req.project!.id;
    const { walletAddress } = req.user!;
    const userTasks = await tasksService.getUserTaskStatus(walletAddress, projectId);
    res.status(200).json({ status: 'success', results: userTasks.length, data: userTasks });
  } catch (error) {
    next(error);
  }
};

export const getPendingTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = req.project!.id;
    const { walletAddress } = req.user!;
    const tasks = await tasksService.getPendingTasksForUser(walletAddress, projectId);
    res.status(200).json({ status: 'success', results: tasks.length, data: tasks });
  } catch (error) {
    next(error);
  }
};

export const requestTaskCompletion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { taskId } = req.body;
    const projectId = req.project!.id; // From Token
    
    const task = await prisma.task.findUnique({ where: { id: taskId } });

    if (!task) return next(new AppError('Task not found', 404));
    
    // SECURITY CHECK: Ensure the task actually belongs to the project in the token
    if (task.projectId !== projectId) {
      return next(new AppError('This task does not belong to the current project', 403));
    }

    if (task.status === false) return next(new AppError('Task is inactive', 400));

    const currentTime = Math.floor(Date.now() / 1000);
    if (task.time !== 0 && task.time < currentTime) {
      return next(new AppError('Task has expired', 400));
    }

    await addTaskToQueue({ 
      taskId, 
      projectId, 
      walletAddress: req.user!.walletAddress 
    });

    res.status(200).json({ status: 'success', message: 'Task submitted' });
  } catch (error) {
    next(error);
  }
};


export const createTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { 
      projectId, 
      type, 
      taskUrl, 
      message, 
      socialMediaName, 
      points, 
      time 
    } = req.body;

    // 1. Fetch Project & Validate Status
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return next(new AppError('Project not found', 404));
    }

    // CHECK: Only allow creation if Project is ACTIVE
    if (project.status !== Status.ACTIVE) {
      return next(new AppError('Cannot create tasks for an Inactive project.', 400));
    }

    // 2. Create Task in DB
    const newTask = await prisma.task.create({
      data: {
        projectId,
        type,
        taskUrl,
        message,
        socialMediaName,
        points,
        time,
        status: true, // Defaulting to Active
      },
    });

    // 3. Update Redis Cache (Append Strategy)
    const cacheKey = `activeTask:${projectId}`;
    const cachedData = await redis.get(cacheKey);

    if (cachedData) {
      // Parse existing cache
      const tasks = JSON.parse(cachedData);
      
      // Append new task
      tasks.push(newTask);

      // Save back to Redis (No TTL, as per previous requirement)
      await redis.set(cacheKey, JSON.stringify(tasks));
    }
    // If cache is null, we do nothing. The next 'GET' request will fetch fresh data from DB.

    res.status(201).json({
      status: 'success',
      data: newTask,
    });

  } catch (error) {
    next(error);
  }
};


export const verifyUserTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userTaskId, status } = req.body;
    const adminAddress = req.user!.walletAddress;

    // 1. Fetch UserTask with related Project and Task details
    const userTask = await prisma.userTask.findUnique({
      where: { id: userTaskId },
      include: {
        task: { select: { points: true } },
        project: { select: { referralTaskPercentage: true } }
      }
    });

    if (!userTask) {
      return next(new AppError('User submission not found', 404));
    }

    // 2. Validate Current Status
    if (userTask.status !== TaskStatus.VERIFYING) {
      return next(new AppError(`Cannot verify task. Current status is ${userTask.status}`, 400));
    }

    // --- SCENARIO A: REJECTION (DELETE) ---
    if (status === 'REJECTED') {
      // 1. DB Delete
      await prisma.userTask.delete({
        where: { id: userTaskId }
      });

      // 2. Redis Update (Remove item from cache)
      const cacheKey = `userTask:${userTask.walletAddress}:${userTask.projectId}`;
      const cachedData = await redis.get(cacheKey);
      
      if (cachedData) {
        let tasks = JSON.parse(cachedData);
        // Filter out the deleted task
        tasks = tasks.filter((t: any) => t.id !== userTaskId);
        await redis.set(cacheKey, JSON.stringify(tasks), 'EX', 86400);
      }

      return res.status(200).json({ status: 'success', message: 'Task rejected and removed.' });
    }

    // --- SCENARIO B: APPROVAL (COMPLETED) ---
    if (status === 'COMPLETED') {
      
      await prisma.$transaction(async (tx) => {
        // 1. Update Task Status
        await tx.userTask.update({
          where: { id: userTaskId },
          data: {
            status: TaskStatus.COMPLETED,
            approvedBy: adminAddress,
            approvedAt: new Date(),
          }
        });

        // 2. Award Points to User
        const taskPoints = userTask.task.points;
        const userStats = await tx.userPoints.update({
          where: { walletAddress_projectId: { walletAddress: userTask.walletAddress, projectId: userTask.projectId } },
          data: {
            totalPoints: { increment: taskPoints },
            userTaskPoints: { increment: taskPoints }
          }
        });

        // 3. Award Referral Commission (If Upline exists)
        if (userStats.referredBy) {
          const commissionRate = userTask.project.referralTaskPercentage; // e.g., 10.5
          
          if (commissionRate > 0) {
            // Math: Points * (Rate / 100) -> 100 * 0.105 = 10.5 -> Ceil(10.5) = 11
            const rawCommission = taskPoints * (commissionRate / 100);
            const commissionPoints = Math.ceil(rawCommission); // ROUND UP

            // Check if Referrer exists in this project
            const referrerExists = await tx.userPoints.findUnique({
               where: { walletAddress_projectId: { walletAddress: userStats.referredBy, projectId: userTask.projectId } }
            });

            if (referrerExists) {
               await tx.userPoints.update({
                 where: { walletAddress_projectId: { walletAddress: userStats.referredBy, projectId: userTask.projectId } },
                 data: {
                   totalPoints: { increment: commissionPoints },
                   referralTaskPoints: { increment: commissionPoints }
                 }
               });
            }
          }
        }
      });

      // 4. Redis Update (Update status to COMPLETED)
      const cacheKey = `userTask:${userTask.walletAddress}:${userTask.projectId}`;
      const cachedData = await redis.get(cacheKey);

      if (cachedData) {
        const tasks = JSON.parse(cachedData);
        // Find and update the specific task in cache
        const taskIndex = tasks.findIndex((t: any) => t.id === userTaskId);
        if (taskIndex > -1) {
          tasks[taskIndex].status = TaskStatus.COMPLETED;
          await redis.set(cacheKey, JSON.stringify(tasks), 'EX', 86400);
        }
      }

      return res.status(200).json({ status: 'success', message: 'Task approved and points awarded.' });
    }

  } catch (error) {
    next(error);
  }
};