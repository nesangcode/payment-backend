import { Router, Response } from 'express';
import { AuthRequest, authenticateUser } from '../lib/auth';
import { idempotencyMiddleware } from '../lib/idempotency';
import stripeAdapter from '../adapters/stripeAdapter';
import subscriptionManager from '../services/subscriptionManager';
import logger from '../lib/logger';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createSubscriptionSchema = z.object({
  uid: z.string(),
  planId: z.string(),
  currency: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const changePaymentMethodSchema = z.object({
  uid: z.string(),
});

/**
 * Create Stripe subscription
 * POST /v1/stripe/subscriptions
 */
router.post(
  '/subscriptions',
  authenticateUser,
  idempotencyMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const validation = createSubscriptionSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Validation Error',
          details: validation.error.errors,
        });
      }

      const { uid, planId, currency, metadata } = validation.data;

      // Verify user is authorized
      if (req.user?.uid !== uid && req.user?.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot create subscription for another user',
        });
      }

      logger.info({ uid, planId }, 'Creating Stripe subscription');

      // Create session via adapter
      const session = await stripeAdapter.createSession({
        uid,
        planId,
        currency: currency as any,
        metadata,
      });

      return res.status(200).json({
        success: true,
        subscriptionId: session.subscriptionId,
        clientSecret: session.clientSecret,
        sessionId: session.sessionId,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to create Stripe subscription');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }
);

/**
 * Change payment method
 * POST /v1/stripe/change-payment-method
 */
router.post(
  '/change-payment-method',
  authenticateUser,
  idempotencyMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const validation = changePaymentMethodSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Validation Error',
          details: validation.error.errors,
        });
      }

      const { uid } = validation.data;

      // Verify user is authorized
      if (req.user?.uid !== uid && req.user?.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot change payment method for another user',
        });
      }

      logger.info({ uid }, 'Creating setup intent for payment method change');

      // Create setup intent
      const clientSecret = await stripeAdapter.createSetupIntent(uid);

      return res.status(200).json({
        success: true,
        clientSecret,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to create setup intent');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }
);

/**
 * Cancel subscription
 * POST /v1/stripe/subscriptions/:id/cancel
 */
router.post(
  '/subscriptions/:id/cancel',
  authenticateUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const subscriptionId = req.params.id;
      const immediate = req.body.immediate === true;

      // Get subscription to verify ownership
      const subscription = await subscriptionManager.getSubscription(subscriptionId);
      if (!subscription) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Subscription not found',
        });
      }

      // Verify user is authorized
      if (req.user?.uid !== subscription.uid && req.user?.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot cancel subscription for another user',
        });
      }

      logger.info({ subscriptionId, immediate }, 'Canceling subscription');

      await subscriptionManager.cancelSubscription(subscriptionId, immediate);

      return res.status(200).json({
        success: true,
        subscriptionId,
        immediate,
        message: immediate
          ? 'Subscription canceled immediately'
          : 'Subscription will cancel at period end',
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to cancel subscription');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }
);

export default router;
