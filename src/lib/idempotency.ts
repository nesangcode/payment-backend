import { Request, Response, NextFunction } from 'express';
import { collections } from './firestore';
import logger from './logger';

interface IdempotencyRecord {
  key: string;
  response: any;
  statusCode: number;
  createdAt: Date;
  expiresAt: Date;
}

const IDEMPOTENCY_TTL = 24 * 60 * 60 * 1000; // 24 hours

export class IdempotencyService {
  private cache = new Map<string, IdempotencyRecord>();

  /**
   * Check if a request with this idempotency key has been processed
   */
  async check(key: string): Promise<IdempotencyRecord | null> {
    // Check in-memory cache first
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > new Date()) {
      return cached;
    }

    // Check Firestore (optional persistence layer)
    try {
      const doc = await collections.webhooks().doc(key).get();
      if (doc.exists) {
        const data = doc.data();
        if (data && data.expiresAt.toDate() > new Date()) {
          return data as IdempotencyRecord;
        }
      }
    } catch (error) {
      logger.error({ error, key }, 'Error checking idempotency');
    }

    return null;
  }

  /**
   * Store the response for an idempotency key
   */
  async store(key: string, response: any, statusCode: number): Promise<void> {
    const record: IdempotencyRecord = {
      key,
      response,
      statusCode,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL),
    };

    // Store in memory
    this.cache.set(key, record);

    // Optionally persist to Firestore
    try {
      await collections.webhooks().doc(key).set(record);
    } catch (error) {
      logger.error({ error, key }, 'Error storing idempotency record');
    }

    // Clean up old entries periodically
    this.cleanup();
  }

  /**
   * Clean up expired entries from memory cache
   */
  private cleanup(): void {
    const now = new Date();
    for (const [key, record] of this.cache.entries()) {
      if (record.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }
}

export const idempotencyService = new IdempotencyService();

/**
 * Express middleware to handle idempotency
 */
export function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const idempotencyKey = req.headers['idempotency-key'] as string;

  if (!idempotencyKey) {
    return next();
  }

  idempotencyService
    .check(idempotencyKey)
    .then((existing) => {
      if (existing) {
        logger.info(
          { idempotencyKey },
          'Returning cached response for idempotent request'
        );
        res.status(existing.statusCode).json(existing.response);
        return;
      }

      // Capture the original res.json to intercept response
      const originalJson = res.json.bind(res);
      res.json = function (body: any) {
        idempotencyService.store(idempotencyKey, body, res.statusCode);
        return originalJson(body);
      };

      next();
    })
    .catch((error) => {
      logger.error({ error, idempotencyKey }, 'Error in idempotency middleware');
      next();
    });
}

/**
 * Generate a dedup key for webhook events
 */
export function generateWebhookDedupKey(provider: string, eventId: string): string {
  return `webhook:${provider}:${eventId}`;
}

/**
 * Check if a webhook event has been processed
 */
export async function isWebhookProcessed(dedupKey: string): Promise<boolean> {
  try {
    const doc = await collections.webhooks().doc(dedupKey).get();
    return doc.exists;
  } catch (error) {
    logger.error({ error, dedupKey }, 'Error checking webhook deduplication');
    return false;
  }
}

/**
 * Mark a webhook event as processed
 */
export async function markWebhookProcessed(
  dedupKey: string,
  provider: string,
  rawId: string,
  status: 'processed' | 'ignored',
  reason?: string
): Promise<void> {
  try {
    await collections.webhooks().doc(dedupKey).set({
      provider,
      rawId,
      processedAt: new Date(),
      dedupKey,
      status,
      reason,
    });
    logger.info({ dedupKey, provider, status }, 'Webhook marked as processed');
  } catch (error) {
    logger.error({ error, dedupKey }, 'Error marking webhook as processed');
    throw error;
  }
}
