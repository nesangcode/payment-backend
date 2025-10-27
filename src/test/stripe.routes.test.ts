// Set environment variable FIRST before any imports
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';

import request from 'supertest';
import express from 'express';
import stripeRoutes from '../routes/stripe.routes';
import stripeAdapter from '../adapters/stripeAdapter';
import subscriptionManager from '../services/subscriptionManager';
import admin from 'firebase-admin';

// Mock Stripe SDK
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: { create: jest.fn(), list: jest.fn() },
    subscriptions: { create: jest.fn() },
    setupIntents: { create: jest.fn() },
    refunds: { create: jest.fn() },
  }));
});

// Mock dependencies
jest.mock('../adapters/stripeAdapter');
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
app.use('/v1/stripe', stripeRoutes);

describe('Stripe Routes', () => {
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

  describe('POST /v1/stripe/subscriptions', () => {
    it('should create a Stripe subscription successfully', async () => {
      const mockSession = {
        subscriptionId: 'sub_123',
        clientSecret: 'cs_test_123',
        sessionId: 'sess_123',
      };

      (stripeAdapter.createSession as jest.Mock).mockResolvedValue(mockSession);

      const response = await request(app)
        .post('/v1/stripe/subscriptions')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          uid: 'user_123',
          planId: 'plan_premium',
          currency: 'USD',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        subscriptionId: 'sub_123',
        clientSecret: 'cs_test_123',
        sessionId: 'sess_123',
      });
      expect(stripeAdapter.createSession).toHaveBeenCalledWith({
        uid: 'user_123',
        planId: 'plan_premium',
        currency: 'USD',
        metadata: undefined,
      });
    });

    it('should reject invalid request body', async () => {
      const response = await request(app)
        .post('/v1/stripe/subscriptions')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          uid: 'user_123',
          // Missing planId
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });

    it('should forbid creating subscription for another user', async () => {
      const response = await request(app)
        .post('/v1/stripe/subscriptions')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          uid: 'other_user',
          planId: 'plan_premium',
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden');
    });

    it('should allow admin to create subscription for any user', async () => {
      const adminUser = { ...mockUser, role: 'admin' };
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(adminUser),
      });

      const mockSession = {
        subscriptionId: 'sub_123',
        clientSecret: 'cs_test_123',
        sessionId: 'sess_123',
      };
      (stripeAdapter.createSession as jest.Mock).mockResolvedValue(mockSession);

      const response = await request(app)
        .post('/v1/stripe/subscriptions')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          uid: 'other_user',
          planId: 'plan_premium',
        });

      expect(response.status).toBe(200);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/v1/stripe/subscriptions')
        .send({
          uid: 'user_123',
          planId: 'plan_premium',
        });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /v1/stripe/change-payment-method', () => {
    it('should create setup intent successfully', async () => {
      const mockClientSecret = 'seti_123_secret';
      (stripeAdapter.createSetupIntent as jest.Mock).mockResolvedValue(mockClientSecret);

      const response = await request(app)
        .post('/v1/stripe/change-payment-method')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          uid: 'user_123',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        clientSecret: mockClientSecret,
      });
    });

    it('should forbid changing payment method for another user', async () => {
      const response = await request(app)
        .post('/v1/stripe/change-payment-method')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          uid: 'other_user',
        });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /v1/stripe/subscriptions/:id/cancel', () => {
    it('should cancel subscription at period end', async () => {
      const mockSubscription = {
        id: 'sub_123',
        uid: 'user_123',
        provider: 'stripe' as const,
        planId: 'plan_premium',
        status: 'active' as const,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (subscriptionManager.getSubscription as jest.Mock).mockResolvedValue(mockSubscription);
      (subscriptionManager.cancelSubscription as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/v1/stripe/subscriptions/sub_123/cancel')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          immediate: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('period end');
      expect(subscriptionManager.cancelSubscription).toHaveBeenCalledWith('sub_123', false);
    });

    it('should cancel subscription immediately', async () => {
      const mockSubscription = {
        id: 'sub_123',
        uid: 'user_123',
        provider: 'stripe' as const,
        planId: 'plan_premium',
        status: 'active' as const,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (subscriptionManager.getSubscription as jest.Mock).mockResolvedValue(mockSubscription);
      (subscriptionManager.cancelSubscription as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/v1/stripe/subscriptions/sub_123/cancel')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          immediate: true,
        });

      expect(response.status).toBe(200);
      expect(response.body.immediate).toBe(true);
      expect(subscriptionManager.cancelSubscription).toHaveBeenCalledWith('sub_123', true);
    });

    it('should return 404 for non-existent subscription', async () => {
      (subscriptionManager.getSubscription as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/v1/stripe/subscriptions/sub_999/cancel')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({});

      expect(response.status).toBe(404);
    });

    it('should forbid canceling subscription for another user', async () => {
      const mockSubscription = {
        id: 'sub_123',
        uid: 'other_user',
        provider: 'stripe' as const,
        planId: 'plan_premium',
        status: 'active' as const,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (subscriptionManager.getSubscription as jest.Mock).mockResolvedValue(mockSubscription);

      const response = await request(app)
        .post('/v1/stripe/subscriptions/sub_123/cancel')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({});

      expect(response.status).toBe(403);
    });
  });
});
