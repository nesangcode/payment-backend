import request from 'supertest';
import express from 'express';
import iapRoutes from '../routes/iap.routes';
import iapAdapter from '../adapters/iapAdapter';
import subscriptionManager from '../services/subscriptionManager';
import admin from 'firebase-admin';

// Mock dependencies
jest.mock('../adapters/iapAdapter');
jest.mock('../services/subscriptionManager');
jest.mock('firebase-admin', () => ({
  auth: jest.fn(() => ({
    verifyIdToken: jest.fn(),
  })),
}));
jest.mock('../lib/firestore', () => ({
  collections: {
    webhooks: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: false }),
        set: jest.fn().mockResolvedValue(undefined),
      })),
    })),
  },
}));

const app = express();
app.use(express.json());
app.use('/v1/iap', iapRoutes);

describe('IAP Routes', () => {
  const mockToken = 'mock-valid-token';
  const mockUser = {
    uid: 'user_123',
    email: 'user@example.com',
    role: 'student',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (admin.auth as jest.Mock).mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue(mockUser),
    });
  });

  describe('POST /v1/iap/validate', () => {
    it('should validate Apple receipt successfully', async () => {
      const mockValidationResult = {
        valid: true,
        transactionId: 'apple_txn_123',
        originalTransactionId: 'apple_orig_123',
        productId: 'com.edtech.group.premium',
        purchaseDate: new Date('2025-01-01'),
        expiresDate: new Date('2025-02-01'),
      };

      (iapAdapter.validateReceipt as jest.Mock).mockResolvedValue(mockValidationResult);

      const response = await request(app)
        .post('/v1/iap/validate')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          uid: 'user_123',
          platform: 'ios',
          receipt: 'mock_apple_receipt_data',
          productId: 'com.edtech.group.premium',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.valid).toBe(true);
      expect(response.body.transactionId).toBe('apple_txn_123');
      expect(response.body.productId).toBe('com.edtech.group.premium');
    });

    it('should validate Google Play receipt successfully', async () => {
      const mockValidationResult = {
        valid: true,
        transactionId: 'google_txn_456',
        originalTransactionId: 'google_orig_456',
        productId: 'com.edtech.group.premium',
        purchaseDate: new Date('2025-01-01'),
        expiresDate: new Date('2025-02-01'),
      };

      (iapAdapter.validateReceipt as jest.Mock).mockResolvedValue(mockValidationResult);

      const response = await request(app)
        .post('/v1/iap/validate')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          uid: 'user_123',
          platform: 'android',
          receipt: 'mock_google_receipt_data',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.valid).toBe(true);
    });

    it('should reject invalid receipt', async () => {
      const mockValidationResult = {
        valid: false,
      };

      (iapAdapter.validateReceipt as jest.Mock).mockResolvedValue(mockValidationResult);

      const response = await request(app)
        .post('/v1/iap/validate')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          uid: 'user_123',
          platform: 'ios',
          receipt: 'invalid_receipt',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid Receipt');
    });

    it('should reject invalid platform', async () => {
      const response = await request(app)
        .post('/v1/iap/validate')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          uid: 'user_123',
          platform: 'windows', // Invalid platform
          receipt: 'mock_receipt',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });

    it('should forbid validating receipt for another user', async () => {
      const response = await request(app)
        .post('/v1/iap/validate')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          uid: 'other_user',
          platform: 'ios',
          receipt: 'mock_receipt',
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden');
    });

    it('should allow admin to validate receipt for any user', async () => {
      const adminUser = { ...mockUser, role: 'admin' };
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(adminUser),
      });

      const mockValidationResult = {
        valid: true,
        transactionId: 'apple_txn_123',
        originalTransactionId: 'apple_orig_123',
        productId: 'com.edtech.group.premium',
        purchaseDate: new Date(),
        expiresDate: new Date(),
      };

      (iapAdapter.validateReceipt as jest.Mock).mockResolvedValue(mockValidationResult);

      const response = await request(app)
        .post('/v1/iap/validate')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          uid: 'other_user',
          platform: 'ios',
          receipt: 'mock_receipt',
        });

      expect(response.status).toBe(200);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/v1/iap/validate')
        .send({
          uid: 'user_123',
          platform: 'ios',
          receipt: 'mock_receipt',
        });

      expect(response.status).toBe(401);
    });

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/v1/iap/validate')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          uid: 'user_123',
          platform: 'ios',
          // Missing receipt
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });
  });

  describe('GET /v1/iap/subscriptions/:uid', () => {
    it('should get user IAP subscriptions', async () => {
      const mockSubscriptions = [
        {
          id: 'sub_iap_1',
          uid: 'user_123',
          provider: 'iap' as const,
          planId: 'com.edtech.group.premium',
          status: 'active' as const,
          metadata: { platform: 'ios' },
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'sub_stripe_1',
          uid: 'user_123',
          provider: 'stripe' as const,
          planId: 'plan_premium',
          status: 'active' as const,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (subscriptionManager.getUserSubscriptions as jest.Mock).mockResolvedValue(mockSubscriptions);

      const response = await request(app)
        .get('/v1/iap/subscriptions/user_123')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.subscriptions).toHaveLength(1); // Only IAP subscriptions
      expect(response.body.subscriptions[0].provider).toBe('iap');
    });

    it('should return empty array if no IAP subscriptions', async () => {
      (subscriptionManager.getUserSubscriptions as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .get('/v1/iap/subscriptions/user_123')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body.subscriptions).toHaveLength(0);
    });

    it('should forbid viewing subscriptions for another user', async () => {
      const response = await request(app)
        .get('/v1/iap/subscriptions/other_user')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(403);
    });

    it('should allow admin to view any user subscriptions', async () => {
      const adminUser = { ...mockUser, role: 'admin' };
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(adminUser),
      });

      (subscriptionManager.getUserSubscriptions as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .get('/v1/iap/subscriptions/other_user')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
    });
  });
});
