import { Router, Response } from 'express';
import { AuthRequest, authenticateUser, requireAdmin } from '../lib/auth';
import { idempotencyMiddleware } from '../lib/idempotency';
import wiseAdapter from '../adapters/wiseAdapter';
import logger from '../lib/logger';
import { z } from 'zod';

const router = Router();

// Validation schemas
const preparePayoutSchema = z.object({
  tutorId: z.string(),
  amount: z.number().positive(),
  currency: z.string(),
  beneficiaryDetails: z.record(z.any()).optional(),
});

const approvePayoutSchema = z.object({
  payoutId: z.string(),
});

/**
 * Prepare a payout
 * POST /v1/payouts/prepare
 */
router.post(
  '/prepare',
  authenticateUser,
  requireAdmin,
  idempotencyMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const validation = preparePayoutSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Validation Error',
          details: validation.error.errors,
        });
      }

      const { tutorId, amount, currency, beneficiaryDetails } = validation.data;

      logger.info({ tutorId, amount, currency }, 'Preparing payout');

      const payoutId = await wiseAdapter.preparePayout({
        tutorId,
        amount,
        currency: currency as any,
        beneficiaryDetails,
      });

      return res.status(200).json({
        success: true,
        payoutId,
        status: 'queued',
        message: 'Payout prepared successfully',
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to prepare payout');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }
);

/**
 * Approve and execute a payout
 * POST /v1/payouts/approve
 */
router.post(
  '/approve',
  authenticateUser,
  requireAdmin,
  idempotencyMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const validation = approvePayoutSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Validation Error',
          details: validation.error.errors,
        });
      }

      const { payoutId } = validation.data;

      logger.info({ payoutId }, 'Approving payout');

      await wiseAdapter.approvePayout({ payoutId });

      return res.status(200).json({
        success: true,
        payoutId,
        status: 'processing',
        message: 'Payout approved and processing',
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to approve payout');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }
);

/**
 * Get payout status
 * GET /v1/payouts/:id
 */
router.get(
  '/:id',
  authenticateUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const payoutId = req.params.id;

      logger.info({ payoutId }, 'Getting payout status');

      const payout = await wiseAdapter.getPayoutStatus(payoutId);

      if (!payout) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Payout not found',
        });
      }

      return res.status(200).json({
        success: true,
        payout,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get payout status');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }
);

export default router;
