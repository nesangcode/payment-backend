import { Router, Request, Response } from 'express';
import iapAdapter from '../adapters/iapAdapter';
import logger from '../lib/logger';
import {
  generateWebhookDedupKey,
  isWebhookProcessed,
  markWebhookProcessed,
} from '../lib/idempotency';

const router = Router();

/**
 * Apple App Store Server Notifications webhook
 * POST /webhooks/appstore
 */
router.post('/appstore', async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    logger.info({ payload }, 'App Store webhook received');

    // Handle webhook through IAP adapter
    const result = await iapAdapter.handleWebhook(payload);

    // Check for deduplication
    const dedupKey = generateWebhookDedupKey('appstore', result.eventId);
    const alreadyProcessed = await isWebhookProcessed(dedupKey);

    if (alreadyProcessed) {
      logger.info({ eventId: result.eventId }, 'App Store webhook already processed (idempotent)');
      return res.status(200).json({
        received: true,
        eventId: result.eventId,
        status: 'already_processed',
      });
    }

    // Mark as processed
    await markWebhookProcessed(
      dedupKey,
      'iap',
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
      'App Store webhook processed'
    );

    return res.status(200).json({
      received: true,
      eventId: result.eventId,
      eventType: result.eventType,
      processed: result.processed,
      reason: result.reason,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'App Store webhook processing failed');
    return res.status(400).json({
      error: 'Webhook Error',
      message: error.message,
    });
  }
});

export default router;
