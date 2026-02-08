import { Worker, Job } from 'bullmq';
import connection from '../config/redis';
import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { ReferralJob } from './referral.queue';

const startReferralWorker = () => {
  const worker = new Worker<ReferralJob>('referral-processing', async (job: Job<ReferralJob>) => {
    const { walletAddress, projectId, referralAddress } = job.data;
    
    logger.info(`Processing onboarding for ${walletAddress} in Project ${projectId}`);

    try {
      // Fetch project settings for points calculation
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) throw new Error('Project not found');

      await prisma.$transaction(async (tx) => {
        // 2. Create UserPoints Record (Join Project)
        // Initialize all point buckets to 0
        await tx.userPoints.upsert({
          where: { walletAddress_projectId: { walletAddress, projectId } },
          update: {}, // If exists, do nothing
          create: {
            walletAddress,
            projectId,
            totalPoints: 0,
            userTaskPoints: 0,
            referralPoints: 0,
            referralTaskPoints: 0,
            referredBy: referralAddress || null,
          }
        });

        // 2. Reward Referrer (If applicable)
        if (referralAddress) {
          // Double-check referrer exists in this project to be safe
          const referrerRecord = await tx.userPoints.findUnique({
             where: { walletAddress_projectId: { walletAddress: referralAddress, projectId } }
          });

          if (referrerRecord) {
             await tx.userPoints.update({
               where: { walletAddress_projectId: { walletAddress: referralAddress, projectId } },
               data: {
                 totalReferrals: { increment: 1 },
                 referralPoints: { increment: project.pointsPerReferral },
                 totalPoints: { increment: project.pointsPerReferral }
               }
             });
             logger.info(`Referral reward added to ${referralAddress}`);
          }
        }
      });

      logger.info(`Onboarding complete for ${walletAddress}`);

    } catch (err: any) {
      logger.error(`Referral Worker Error: ${err.message}`);
      throw err; 
    }

  }, { connection });

  worker.on('failed', (job, err) => {
    logger.error(`Referral Job ${job?.id} failed: ${err.message}`);
  });
  
  logger.info('🚀 Referral Worker Started');
};

export default startReferralWorker;