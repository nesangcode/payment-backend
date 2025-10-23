import {
  generateWebhookDedupKey,
  isWebhookProcessed,
  markWebhookProcessed,
} from '../lib/idempotency';
import { collections } from '../lib/firestore';

// Mock Firestore
jest.mock('../lib/firestore', () => ({
  collections: {
    webhooks: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
      })),
    })),
  },
}));

describe('Webhook Idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateWebhookDedupKey', () => {
    it('should generate a consistent dedup key', () => {
      const key1 = generateWebhookDedupKey('stripe', 'evt_123');
      const key2 = generateWebhookDedupKey('stripe', 'evt_123');

      expect(key1).toBe('webhook:stripe:evt_123');
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different providers', () => {
      const stripeKey = generateWebhookDedupKey('stripe', 'evt_123');
      const iapKey = generateWebhookDedupKey('iap', 'evt_123');

      expect(stripeKey).not.toBe(iapKey);
    });

    it('should generate different keys for different event IDs', () => {
      const key1 = generateWebhookDedupKey('stripe', 'evt_123');
      const key2 = generateWebhookDedupKey('stripe', 'evt_456');

      expect(key1).not.toBe(key2);
    });
  });

  describe('isWebhookProcessed', () => {
    it('should return false for unprocessed webhook', async () => {
      const mockGet = jest.fn().mockResolvedValue({ exists: false });
      const mockDoc = jest.fn().mockReturnValue({ get: mockGet });
      (collections.webhooks as jest.Mock).mockReturnValue({ doc: mockDoc });

      const result = await isWebhookProcessed('webhook:stripe:evt_123');

      expect(result).toBe(false);
      expect(mockDoc).toHaveBeenCalledWith('webhook:stripe:evt_123');
    });

    it('should return true for already processed webhook', async () => {
      const mockGet = jest.fn().mockResolvedValue({ exists: true });
      const mockDoc = jest.fn().mockReturnValue({ get: mockGet });
      (collections.webhooks as jest.Mock).mockReturnValue({ doc: mockDoc });

      const result = await isWebhookProcessed('webhook:stripe:evt_123');

      expect(result).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      const mockGet = jest.fn().mockRejectedValue(new Error('Firestore error'));
      const mockDoc = jest.fn().mockReturnValue({ get: mockGet });
      (collections.webhooks as jest.Mock).mockReturnValue({ doc: mockDoc });

      const result = await isWebhookProcessed('webhook:stripe:evt_123');

      expect(result).toBe(false); // Should return false on error
    });
  });

  describe('markWebhookProcessed', () => {
    it('should mark webhook as processed', async () => {
      const mockSet = jest.fn().mockResolvedValue(undefined);
      const mockDoc = jest.fn().mockReturnValue({ set: mockSet });
      (collections.webhooks as jest.Mock).mockReturnValue({ doc: mockDoc });

      await markWebhookProcessed(
        'webhook:stripe:evt_123',
        'stripe',
        'evt_123',
        'processed'
      );

      expect(mockDoc).toHaveBeenCalledWith('webhook:stripe:evt_123');
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'stripe',
          rawId: 'evt_123',
          dedupKey: 'webhook:stripe:evt_123',
          status: 'processed',
          processedAt: expect.any(Date),
        })
      );
    });

    it('should mark webhook as ignored with reason', async () => {
      const mockSet = jest.fn().mockResolvedValue(undefined);
      const mockDoc = jest.fn().mockReturnValue({ set: mockSet });
      (collections.webhooks as jest.Mock).mockReturnValue({ doc: mockDoc });

      await markWebhookProcessed(
        'webhook:stripe:evt_123',
        'stripe',
        'evt_123',
        'ignored',
        'Unhandled event type'
      );

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ignored',
          reason: 'Unhandled event type',
        })
      );
    });
  });

  describe('Webhook Idempotency Integration', () => {
    it('should prevent duplicate processing of same webhook', async () => {
      const dedupKey = generateWebhookDedupKey('stripe', 'evt_duplicate');

      // First call - not processed yet
      const mockGet1 = jest.fn().mockResolvedValue({ exists: false });
      const mockDoc1 = jest.fn().mockReturnValue({ get: mockGet1, set: jest.fn() });
      (collections.webhooks as jest.Mock).mockReturnValue({ doc: mockDoc1 });

      const isProcessed1 = await isWebhookProcessed(dedupKey);
      expect(isProcessed1).toBe(false);

      // Mark as processed
      await markWebhookProcessed(dedupKey, 'stripe', 'evt_duplicate', 'processed');

      // Second call - already processed
      const mockGet2 = jest.fn().mockResolvedValue({ exists: true });
      const mockDoc2 = jest.fn().mockReturnValue({ get: mockGet2 });
      (collections.webhooks as jest.Mock).mockReturnValue({ doc: mockDoc2 });

      const isProcessed2 = await isWebhookProcessed(dedupKey);
      expect(isProcessed2).toBe(true);
    });

    it('should allow processing of different webhooks', async () => {
      const dedupKey1 = generateWebhookDedupKey('stripe', 'evt_001');
      const dedupKey2 = generateWebhookDedupKey('stripe', 'evt_002');

      const mockGet = jest.fn().mockResolvedValue({ exists: false });
      const mockDoc = jest.fn().mockReturnValue({ get: mockGet });
      (collections.webhooks as jest.Mock).mockReturnValue({ doc: mockDoc });

      const isProcessed1 = await isWebhookProcessed(dedupKey1);
      const isProcessed2 = await isWebhookProcessed(dedupKey2);

      expect(isProcessed1).toBe(false);
      expect(isProcessed2).toBe(false);
      expect(dedupKey1).not.toBe(dedupKey2);
    });
  });

  describe('Multi-Provider Idempotency', () => {
    it('should maintain separate idempotency for different providers', async () => {
      const stripeKey = generateWebhookDedupKey('stripe', 'evt_123');
      const iapKey = generateWebhookDedupKey('iap', 'evt_123');
      const wiseKey = generateWebhookDedupKey('wise', 'evt_123');

      expect(stripeKey).toBe('webhook:stripe:evt_123');
      expect(iapKey).toBe('webhook:iap:evt_123');
      expect(wiseKey).toBe('webhook:wise:evt_123');

      // All should be different
      expect(new Set([stripeKey, iapKey, wiseKey]).size).toBe(3);
    });
  });
});
