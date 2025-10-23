import { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';
import logger from './logger';

export interface AuthRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    role?: string;
  };
}

/**
 * Middleware to verify Firebase Auth token
 */
export async function authenticateUser(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
      return;
    }

    const token = authHeader.substring(7);

    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        role: decodedToken.role || 'student',
      };
      next();
    } catch (error) {
      logger.error({ error }, 'Token verification failed');
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }
  } catch (error) {
    logger.error({ error }, 'Authentication error');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed',
    });
  }
}

/**
 * Optional authentication (allows both authenticated and unauthenticated requests)
 */
export async function optionalAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          role: decodedToken.role || 'student',
        };
      } catch (error) {
        logger.warn({ error }, 'Optional auth: invalid token');
      }
    }

    next();
  } catch (error) {
    logger.error({ error }, 'Optional auth error');
    next();
  }
}

/**
 * Middleware to check if user has admin role
 */
export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required',
    });
    return;
  }

  next();
}

/**
 * Middleware to verify webhook signature (generic)
 */
export function verifyWebhookSignature(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signature = req.headers['stripe-signature'] || req.headers['x-webhook-signature'];

    if (!signature) {
      logger.warn('Webhook signature missing');
      res.status(400).json({
        error: 'Bad Request',
        message: 'Webhook signature missing',
      });
      return;
    }

    // Signature verification will be handled by individual adapters
    next();
  };
}
