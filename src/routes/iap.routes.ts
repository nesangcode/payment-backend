import { Router, Response } from 'express';
import { AuthRequest, authenticateUser } from '../lib/auth';
import { idempotencyMiddleware } from '../lib/idempotency';
import iapAdapter from '../adapters/iapAdapter';
import subscriptionManager from '../services/subscriptionManager';
import logger from '../lib/logger';
import { z } from 'zod';

const router = Router();

// Validation schemas
const validateReceiptSchema = z.object({
  uid: z.string(),
  platform: z.enum(['ios', 'android']),
  receipt: z.string(),
  productId: z.string().optional(),
});

/**
 * Validate IAP receipt
 * POST /v1/iap/validate
 */
router.post(
  '/validate',
  authenticateUser,
  idempotencyMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const validation = validateReceiptSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Validation Error',
          details: validation.error.errors,
        });
      }

      const { uid, platform, receipt, productId } = validation.data;

      // Verify user is authorized
      if (req.user?.uid !== uid && req.user?.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot validate receipt for another user',
        });
      }

      logger.info({ uid, platform }, 'Validating IAP receipt');

      // Validate receipt via adapter
      const result = await iapAdapter.validateReceipt({
        uid,
        platform,
        receipt,
        productId,
      });

      if (!result.valid) {
        return res.status(400).json({
          error: 'Invalid Receipt',
          message: 'Receipt validation failed',
        });
      }

      return res.status(200).json({
        success: true,
        valid: result.valid,
        transactionId: result.transactionId,
        originalTransactionId: result.originalTransactionId,
        productId: result.productId,
        purchaseDate: result.purchaseDate,
        expiresDate: result.expiresDate,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to validate IAP receipt');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }
);

/**
 * Get IAP subscription status
 * GET /v1/iap/subscriptions/:uid
 */
router.get(
  '/subscriptions/:uid',
  authenticateUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.params.uid;

      // Verify user is authorized
      if (req.user?.uid !== uid && req.user?.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot view subscriptions for another user',
        });
      }

      // Get user's IAP subscriptions
      const subscriptions = await subscriptionManager.getUserSubscriptions(uid);
      const iapSubscriptions = subscriptions.filter((sub: any) => sub.provider === 'iap');

      return res.status(200).json({
        success: true,
        subscriptions: iapSubscriptions,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get IAP subscriptions');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }
);

export default router;
