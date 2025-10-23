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
 * Google Play Developer Notifications webhook
 * POST /webhooks/play
 */
router.post('/play', async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    logger.info({ payload }, 'Google Play webhook received');

    // Decode the message if it's in Pub/Sub format
    let decodedPayload = payload;
    if (payload.message && payload.message.data) {
      const decodedData = Buffer.from(payload.message.data, 'base64').toString('utf-8');
      decodedPayload = JSON.parse(decodedData);
    }

    // Handle webhook through IAP adapter
    const result = await iapAdapter.handleWebhook(decodedPayload);

    // Check for deduplication
    const dedupKey = generateWebhookDedupKey('play', result.eventId);
    const alreadyProcessed = await isWebhookProcessed(dedupKey);

    if (alreadyProcessed) {
      logger.info({ eventId: result.eventId }, 'Google Play webhook already processed (idempotent)');
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
      'Google Play webhook processed'
    );

    return res.status(200).json({
      received: true,
      eventId: result.eventId,
      eventType: result.eventType,
      processed: result.processed,
      reason: result.reason,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Google Play webhook processing failed');
    return res.status(400).json({
      error: 'Webhook Error',
      message: error.message,
    });
  }
});

export default router;
