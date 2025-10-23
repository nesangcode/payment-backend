import { Router, Request, Response } from 'express';
import wiseAdapter from '../adapters/wiseAdapter';
import logger from '../lib/logger';
import {
  generateWebhookDedupKey,
  isWebhookProcessed,
  markWebhookProcessed,
} from '../lib/idempotency';

const router = Router();

/**
 * Wise webhook handler
 * POST /webhooks/wise
 */
router.post('/wise', async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    const signature = req.headers['x-signature'] as string;

    logger.info({ payload }, 'Wise webhook received');

    // Handle webhook through Wise adapter
    const result = await wiseAdapter.handleWebhook(payload, signature);

    // Check for deduplication
    const dedupKey = generateWebhookDedupKey('wise', result.eventId);
    const alreadyProcessed = await isWebhookProcessed(dedupKey);

    if (alreadyProcessed) {
      logger.info({ eventId: result.eventId }, 'Wise webhook already processed (idempotent)');
      return res.status(200).json({
        received: true,
        eventId: result.eventId,
        status: 'already_processed',
      });
    }

    // Mark as processed
    await markWebhookProcessed(
      dedupKey,
      'wise',
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
      'Wise webhook processed'
    );

    return res.status(200).json({
      received: true,
      eventId: result.eventId,
      eventType: result.eventType,
      processed: result.processed,
      reason: result.reason,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Wise webhook processing failed');
    return res.status(400).json({
      error: 'Webhook Error',
      message: error.message,
    });
  }
});

export default router;
