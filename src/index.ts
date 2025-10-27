import express, { Request, Response, NextFunction } from 'express';
import * as dotenv from 'dotenv';
import logger from './lib/logger';
import { initializeFirestore } from './lib/firestore';

// Import routes
import stripeRoutes from './routes/stripe.routes';
import iapRoutes from './routes/iap.routes';
import wiseRoutes from './routes/wise.routes';
import adminRoutes from './routes/admin.routes';

// Import webhooks
import stripeWebhook from './webhooks/stripe.webhook';
import appstoreWebhook from './webhooks/appstore.webhook';
import playWebhook from './webhooks/play.webhook';
import wiseWebhook from './webhooks/wise.webhook';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Firestore
initializeFirestore();

// Middleware for raw body (needed for Stripe webhook signature verification)
app.use(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  (req: any, _res, next) => {
    req.rawBody = req.body;
    next();
  }
);

// Standard JSON middleware for all other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info({
    method: req.method,
    path: req.path,
    ip: req.ip,
  }, 'Incoming request');
  next();
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    healthy: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
app.use('/v1/stripe', stripeRoutes);
app.use('/v1/iap', iapRoutes);
app.use('/v1/payouts', wiseRoutes);

// Admin routes - mounted at multiple paths for different access patterns
app.use('/v1', adminRoutes);  // For generic /:id endpoints

// Webhook Routes
app.use('/webhooks', stripeWebhook);
app.use('/webhooks', appstoreWebhook);
app.use('/webhooks', playWebhook);
app.use('/webhooks', wiseWebhook);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
  });
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`🚀 Payments service listening on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Region: ${process.env.REGION || 'not set'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export default app;
