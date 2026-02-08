import { prisma } from '../config/prisma';
import { TaskStatus } from '@prisma/client';
import redis from '../config/redis'; 

const ONE_DAY_SECONDS = 24 * 60 * 60;

// --- NEW FUNCTION ---
export const getUserTaskStatus = async (walletAddress: string, projectId: string) => {
  const cacheKey = `userTask:${walletAddress}:${projectId}`;

  // 1. Check Redis
  const cachedData = await redis.get(cacheKey);
  if (cachedData) {
    return JSON.parse(cachedData);
  }

  // 2. DB Fallback
  // We need to join with the Task table to filter by projectId
  const userTasks = await prisma.userTask.findMany({
    where: {
      walletAddress: walletAddress,
      projectId: projectId
    },
    // We still include task details for the frontend UI
    include: { 
      task: {
        select: {
          id: true,
          type: true,
          message: true,
          points: true
        }
      } 
    } 
  });

  // 3. Set Cache with 1 Day TTL
  if (userTasks.length > 0) {
    await redis.set(cacheKey, JSON.stringify(userTasks), 'EX', ONE_DAY_SECONDS);
  }

  return userTasks;
};


export const getActiveTasksForProject = async (projectId: string) => {
  const cacheKey = `activeTask:${projectId}`;

  const cachedData = await redis.get(cacheKey);
  if (cachedData) return JSON.parse(cachedData);

  const currentTime = Math.floor(Date.now() / 1000);

  const tasks = await prisma.task.findMany({
    where: {
      projectId,
      status: true,
      time: { gt: currentTime }
    },
    orderBy: [
      { status: 'desc' }, 
      { time: 'desc' }
    ]
  });

  if (tasks.length > 0) {
    await redis.set(cacheKey, JSON.stringify(tasks));
  }

  return tasks;
};

export const getPendingTasksForUser = async (walletAddress: string, projectId: string) => {
  const projectTasks = await getActiveTasksForProject(projectId);;
  
  const userInteractions = await prisma.userTask.findMany({
    where: { 
      walletAddress, 
      projectId
    },
    select: { taskId: true, status: true }
  });

  const completedTaskIds = new Set(
    userInteractions
      .filter((ut) => ut.status === TaskStatus.COMPLETED || ut.status === TaskStatus.VERIFYING)
      .map((ut) => ut.taskId)
  );

  return projectTasks.filter((task: any) => !completedTaskIds.has(task.id));
};