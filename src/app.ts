import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { apiLimiter } from './middlewares/rateLimit';
import { AppError } from './utils/AppError';

// Import Routes
import authRoutes from './routes/auth.routes';
import pointsRoutes from './routes/points.routes';
import tasksRoutes from './routes/tasks.routes';
import userRoutes from './routes/user.routes';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '10kb' }));
app.use(morgan('dev'));

app.use('/api', apiLimiter);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/points', pointsRoutes);
app.use('/api/v1/tasks', tasksRoutes);
app.use('/api/v1/users', userRoutes);

app.all('*', (req: Request, res: Response, next: NextFunction) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const statusCode = err.statusCode || 500;
  const message =
    (typeof err?.message === 'string' && err.message) || 'Something went wrong';
  res.status(statusCode).json({
    status: statusCode >= 500 ? 'error' : 'fail',
    message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

export default app;

