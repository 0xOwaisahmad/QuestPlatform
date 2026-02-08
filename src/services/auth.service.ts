import { generateNonce, SiweMessage } from 'siwe';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { Status } from '@prisma/client';
import redis from '../config/redis';
import { AppError } from '../utils/AppError';
import { addReferralJob } from '../queue/referral.queue'; // Import the queue

const NONCE_TTL = 300; 

export const generateAndSaveNonce = async (walletAddress: string, projectId: string) => {
  const nonce = generateNonce();
  const key = `auth:nonce:${walletAddress.toLowerCase()}:${projectId}`;
  await redis.set(key, nonce, 'EX', NONCE_TTL);
  return nonce;
};

// Updated Signature
export const verifyAndLoginUser = async (
  message: string, 
  signature: string, 
  projectId: string, 
  referral?: string
) => {
  
  // 1. Parse & Verify Message
  let siweMessage: SiweMessage;
  try {
    siweMessage = new SiweMessage(message);
  } catch (e) {
    throw new AppError('Invalid SIWE message format', 400);
  }

  const walletAddress = siweMessage.address.toLowerCase();
  const referralAddress = referral ? referral.toLowerCase() : undefined;
  const nonceInMessage = siweMessage.nonce;

  // 2. Validate Nonce
  const key = `auth:nonce:${walletAddress}:${projectId}`;
  const storedNonce = await redis.get(key);
  if (!storedNonce || storedNonce !== nonceInMessage) {
    throw new AppError('Invalid or expired nonce.', 400);
  }

  const fields = await siweMessage.verify({ signature });
  await redis.del(key); // Cleanup

  // 1. Fetch Project Settings & Status
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  // CHECK: Ensure Project is Active (Using Enum)
  if (project.status !== Status.ACTIVE) {
    throw new AppError('This project is currently inactive or paused.', 403);
  }

  // 3. Global User Table Check (Synchronous)
  const user = await prisma.user.upsert({
    where: { walletAddress: fields.data.address },
    update: {},
    create: { walletAddress: fields.data.address },
  });

  // 4. Check Project Membership (Synchronous)
  const existingMembership = await prisma.userPoints.findUnique({
    where: { walletAddress_projectId: { walletAddress, projectId } }
  });

  if (!existingMembership) {
    // --- NEW USER ONBOARDING LOGIC ---

    // B. Validation 1: Mandatory Referral Code
    if (project.isReferralCodeRequired && !referralAddress) {
      throw new AppError('Referral code is required to join this project.', 400);
    }

    // C. Validation 2: Referrer Validity
    if (referralAddress) {
      const referrerExists = await prisma.userPoints.findUnique({
        where: { walletAddress_projectId: { walletAddress: referralAddress, projectId } }
      });
      
      if (!referrerExists) {
        throw new AppError('Invalid Referral: Referrer does not belong to this project.', 400);
      }
    }

    // D. Queue Execution (Offload DB writes to Worker)
    await addReferralJob({
      walletAddress,
      projectId,
      referralAddress
    });
  }

  // 5. Generate JWT
  const token = jwt.sign(
    { walletAddress: fields.data.address, projectId }, 
    process.env.JWT_SECRET as string, 
    { expiresIn: '1d' }
  );

  const { createdAt, ...userFields } = user;
  return { token, ...userFields };
};