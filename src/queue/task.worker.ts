import { Worker, Job } from 'bullmq';
import connection from '../config/redis';
import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { TaskVerificationJob } from './task.queue';

const startTaskWorker = () => {
  const worker = new Worker<TaskVerificationJob>('task-verification', async (job: Job<TaskVerificationJob>) => {
    // logger.info(`Processing task submission ${job.id} for ${job.data.walletAddress}`);
    
    const { taskId, projectId, walletAddress } = job.data;

    try {
      // 1. Check for Duplicates
      const existing = await prisma.userTask.findUnique({
        where: { 
          taskId_walletAddress: { taskId, walletAddress } 
        }
      });

      if (existing) {
        logger.warn(`Duplicate submission ignored for User: ${walletAddress}, Task: ${taskId}`);
        return; // STOP. Do not create new row.
      }

      // 2. Create UserTask with status VERIFYING
      await prisma.userTask.create({
        data: {
          taskId,
          projectId,
          walletAddress,
          status: 'VERIFYING',
          // approvedBy/approvedAt remain null waiting for Admin
        }
      });

      logger.info(`UserTask created (VERIFYING) for User: ${walletAddress}, Task: ${taskId}`);

    } catch (err: any) {
      // Catch DB errors (like race conditions on unique constraint)
      logger.error(`Worker Error: ${err.message}`);
      throw err; // Throwing allows BullMQ to retry if it was a temporary connection issue
    }

  }, { connection });

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed: ${err.message}`);
  });
  
  logger.info('🚀 BullMQ Worker Started');
};

export default startTaskWorker;