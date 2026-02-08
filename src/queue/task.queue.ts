import { Queue } from 'bullmq';
import connection from '../config/redis';

// Simplified Job Data
export interface TaskVerificationJob {
  taskId: string;
  projectId: string;
  walletAddress: string;
}

export const taskQueue = new Queue<TaskVerificationJob>('task-verification', { connection });

export const addTaskToQueue = async (data: TaskVerificationJob) => {
  return await taskQueue.add('verify-task', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  });
};