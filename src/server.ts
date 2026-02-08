/// <reference path="./types/express.d.ts" />
import 'dotenv/config';
import cluster from 'cluster';
import os from 'os';
import app from './app';
import logger from './config/logger';
import startTaskWorker from './queue/task.worker';      // Renamed import for clarity
import startReferralWorker from './queue/referral.worker'; // Import the new worker

const PORT = process.env.PORT || 3000;
const numCPUs = os.cpus().length;

if (cluster.isPrimary) {
  logger.info(`Primary process ${process.pid} is running`);
  logger.info(`Forking ${numCPUs} workers...`);

  for (let i = 0; i < numCPUs; i++) {
    const worker = cluster.fork();
    
    // We only want ONE worker process handling background jobs to avoid conflicts
    if (i === 0) {
        worker.send({ type: 'START_QUEUES' }); // Updated name
    }
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork(); 
  });

} else {
  // WORKER PROCESS
  process.on('message', (msg: any) => {
    if (msg.type === 'START_QUEUES') { // Listen for the new name
        logger.info(`Worker ${process.pid} assigned as Queue Processor`);
        
        // Start BOTH workers
        startTaskWorker();
        startReferralWorker();
    }
  });

  const server = app.listen(PORT, () => {
    logger.info(`Worker ${process.pid} started server on port ${PORT}`);
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully');
    server.close(() => {
      logger.info('Process terminated');
    });
  });
}