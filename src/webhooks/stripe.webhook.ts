import { Router, Request, Response } from 'express';
import stripeAdapter from '../adapters/stripeAdapter';
import logger from '../lib/logger';
import {
  generateWebhookDedupKey,
  isWebhookProcessed,
  markWebhookProcessed,
} from '../lib/idempotency';

const router = Router();

/**
 * Stripe webhook handler
 * POST /webhooks/stripe
 */
router.post('/stripe', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    const skipSignatureVerification = process.env.SKIP_STRIPE_SIGNATURE_VERIFICATION === 'true';

    if (!signature && !skipSignatureVerification) {
      logger.warn('Stripe webhook signature missing');
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Webhook signature missing',
      });
    }

    // Get raw body (must be preserved by Express middleware)
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    // Handle webhook through adapter (signature can be undefined if skipping verification)
    const result = await stripeAdapter.handleWebhook(rawBody, signature);

    // Check for deduplication
    const dedupKey = generateWebhookDedupKey('stripe', result.eventId);
    const alreadyProcessed = await isWebhookProcessed(dedupKey);

    if (alreadyProcessed) {
      logger.info({ eventId: result.eventId }, 'Stripe webhook already processed (idempotent)');
      return res.status(200).json({
        received: true,
        eventId: result.eventId,
        status: 'already_processed',
      });
    }

    // Mark as processed
    await markWebhookProcessed(
      dedupKey,
      'stripe',
      result.eventId,
      result.processed ? 'processed' : 'ignored',
      result.reason
    );

    logger.info(
      {
        eventId: result.eventId,
        eventType: result.eventType,
        processed: result.processed,
      },
      'Stripe webhook processed'
    );

    return res.status(200).json({
      received: true,
      eventId: result.eventId,
      eventType: result.eventType,
      processed: result.processed,
      reason: result.reason,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Stripe webhook processing failed');
    return res.status(400).json({
      error: 'Webhook Error',
      message: error.message,
    });
  }
});

export default router;
