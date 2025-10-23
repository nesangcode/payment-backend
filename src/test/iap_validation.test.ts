import iapAdapter from '../adapters/iapAdapter';
import { collections } from '../lib/firestore';

// Mock Firestore
jest.mock('../lib/firestore', () => ({
  collections: {
    subscriptions: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn(),
      })),
    })),
    invoices: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn(),
      })),
    })),
    payments: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn(),
      })),
    })),
    entitlements: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn(),
      })),
    })),
    ledger: jest.fn(() => ({
      add: jest.fn(),
    })),
    billingCustomers: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn(),
      })),
    })),
  },
}));

describe('IAP Receipt Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Apple Receipt Validation', () => {
    it('should validate Apple receipt successfully (MOCK)', async () => {
      const mockSet = jest.fn().mockResolvedValue(undefined);
      const mockDoc = jest.fn().mockReturnValue({ set: mockSet });
      const mockAdd = jest.fn().mockResolvedValue(undefined);

      (collections.subscriptions as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.invoices as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.payments as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.entitlements as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.billingCustomers as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.ledger as jest.Mock).mockReturnValue({ add: mockAdd });

      const result = await iapAdapter.validateReceipt({
        uid: 'user_123',
        platform: 'ios',
        receipt: 'mock_apple_receipt_data',
      });

      expect(result.valid).toBe(true);
      expect(result.transactionId).toBeDefined();
      expect(result.originalTransactionId).toBeDefined();
      expect(result.productId).toBe('com.edtech.group.premium');
      expect(result.expiresDate).toBeDefined();

      // Verify subscription was created
      expect(mockSet).toHaveBeenCalled();
      expect(mockAdd).toHaveBeenCalled();
    });

    it('should store entitlements for Apple IAP', async () => {
      const mockSet = jest.fn().mockResolvedValue(undefined);
      const mockDoc = jest.fn().mockReturnValue({ set: mockSet });
      const mockAdd = jest.fn().mockResolvedValue(undefined);

      (collections.subscriptions as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.invoices as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.payments as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.entitlements as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.billingCustomers as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.ledger as jest.Mock).mockReturnValue({ add: mockAdd });

      await iapAdapter.validateReceipt({
        uid: 'user_123',
        platform: 'ios',
        receipt: 'mock_receipt',
      });

      // Verify entitlements were set with groupReplay: true
      const entitlementCalls = mockSet.mock.calls.filter(
        (call) => call[0].features
      );
      expect(entitlementCalls.length).toBeGreaterThan(0);
      expect(entitlementCalls[0][0].features.groupReplay).toBe(true);
      expect(entitlementCalls[0][0].features.oneToOne).toBe(false);
    });
  });

  describe('Google Play Receipt Validation', () => {
    it('should validate Google Play receipt successfully (MOCK)', async () => {
      const mockSet = jest.fn().mockResolvedValue(undefined);
      const mockDoc = jest.fn().mockReturnValue({ set: mockSet });
      const mockAdd = jest.fn().mockResolvedValue(undefined);

      (collections.subscriptions as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.invoices as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.payments as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.entitlements as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.billingCustomers as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.ledger as jest.Mock).mockReturnValue({ add: mockAdd });

      const result = await iapAdapter.validateReceipt({
        uid: 'user_456',
        platform: 'android',
        receipt: 'mock_google_receipt_data',
      });

      expect(result.valid).toBe(true);
      expect(result.transactionId).toBeDefined();
      expect(result.originalTransactionId).toBeDefined();
      expect(result.productId).toBe('com.edtech.group.premium');

      // Verify subscription was created
      expect(mockSet).toHaveBeenCalled();
    });

    it('should set Android policy flag for Google Play', async () => {
      const mockSet = jest.fn().mockResolvedValue(undefined);
      const mockDoc = jest.fn().mockReturnValue({ set: mockSet });
      const mockAdd = jest.fn().mockResolvedValue(undefined);

      (collections.subscriptions as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.invoices as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.payments as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.entitlements as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.billingCustomers as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.ledger as jest.Mock).mockReturnValue({ add: mockAdd });

      await iapAdapter.validateReceipt({
        uid: 'user_456',
        platform: 'android',
        receipt: 'mock_receipt',
      });

      // Verify Android policy flag was set
      const entitlementCalls = mockSet.mock.calls.filter(
        (call) => call[0].features
      );
      expect(entitlementCalls.length).toBeGreaterThan(0);
      expect(entitlementCalls[0][0].features.androidNoReplay).toBe(true);
    });
  });

  describe('Webhook Handling', () => {
    it('should handle Apple renewal webhook', async () => {
      const payload = {
        notification_type: 'DID_RENEW',
        transaction_id: 'txn_123',
        original_transaction_id: 'orig_txn_123',
      };

      const result = await iapAdapter.handleWebhook(payload);

      expect(result.eventId).toBe('txn_123');
      expect(result.eventType).toBe('DID_RENEW');
      expect(result.processed).toBe(true);
    });

    it('should handle Apple refund webhook', async () => {
      const payload = {
        notification_type: 'REFUND',
        transaction_id: 'txn_refund_123',
        original_transaction_id: 'orig_txn_123',
      };

      const result = await iapAdapter.handleWebhook(payload);

      expect(result.eventId).toBe('txn_refund_123');
      expect(result.eventType).toBe('REFUND');
      expect(result.processed).toBe(true);
    });

    it('should handle Google Play renewal webhook', async () => {
      const payload = {
        subscriptionNotification: {
          notificationType: 2, // SUBSCRIPTION_RENEWED
          purchaseToken: 'token_123',
        },
      };

      const result = await iapAdapter.handleWebhook(payload);

      expect(result.eventId).toBe('token_123');
      expect(result.eventType).toBe('google_2');
      expect(result.processed).toBe(true);
    });

    it('should handle Google Play refund webhook', async () => {
      const payload = {
        subscriptionNotification: {
          notificationType: 12, // SUBSCRIPTION_REVOKED (refund)
          purchaseToken: 'token_refund_123',
        },
      };

      const result = await iapAdapter.handleWebhook(payload);

      expect(result.eventId).toBe('token_refund_123');
      expect(result.eventType).toBe('google_12');
      expect(result.processed).toBe(true);
    });
  });

  describe('Ledger Entries', () => {
    it('should create ledger entry for successful validation', async () => {
      const mockSet = jest.fn().mockResolvedValue(undefined);
      const mockDoc = jest.fn().mockReturnValue({ set: mockSet });
      const mockAdd = jest.fn().mockResolvedValue(undefined);

      (collections.subscriptions as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.invoices as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.payments as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.entitlements as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.billingCustomers as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.ledger as jest.Mock).mockReturnValue({ add: mockAdd });

      await iapAdapter.validateReceipt({
        uid: 'user_123',
        platform: 'ios',
        receipt: 'mock_receipt',
      });

      // Verify ledger entry was created
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment.succeeded',
          provider: 'iap',
          uid: 'user_123',
          amount: expect.any(Number),
        })
      );
    });
  });

  describe('IAP Refund Handling', () => {
    it('should throw error for direct refund attempts', async () => {
      await expect(
        iapAdapter.refund({
          paymentId: 'payment_123',
          amount: 9.99,
          reason: 'customer_request',
        })
      ).rejects.toThrow('IAP refunds must be processed through');
    });

    it('should handle refund webhooks (via store)', async () => {
      // Refunds are handled via webhooks from App Store/Google Play
      const appleRefundPayload = {
        notification_type: 'REFUND',
        transaction_id: 'txn_refund',
      };

      const result = await iapAdapter.handleWebhook(appleRefundPayload);

      expect(result.processed).toBe(true);
      expect(result.eventType).toBe('REFUND');
    });
  });
});
