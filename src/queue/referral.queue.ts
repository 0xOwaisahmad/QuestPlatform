import { Queue } from 'bullmq';
import connection from '../config/redis';

export interface ReferralJob {
  walletAddress: string;
  projectId: string;
  referralAddress?: string; // Optional
}

export const referralQueue = new Queue<ReferralJob>('referral-processing', { connection });

export const addReferralJob = async (data: ReferralJob) => {
  return await referralQueue.add('process-referral', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  });
};