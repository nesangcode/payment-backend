import request from 'supertest';
import express from 'express';
import adminRoutes from '../routes/admin.routes';
import subscriptionManager from '../services/subscriptionManager';
import invoiceService from '../services/invoiceService';
import entitlementService from '../services/entitlementService';
import admin from 'firebase-admin';

// Mock dependencies
jest.mock('../services/subscriptionManager');
jest.mock('../services/invoiceService');
jest.mock('../services/entitlementService');
jest.mock('firebase-admin', () => ({
  auth: jest.fn(() => ({
    verifyIdToken: jest.fn(),
  })),
}));

const mockChain: any = {
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  get: jest.fn().mockResolvedValue({ docs: [] }),
};

jest.mock('../lib/firestore', () => ({
  collections: {
    ledger: jest.fn(() => mockChain),
  },
}));

const app = express();
app.use(express.json());
app.use('/v1', adminRoutes);

describe('Admin Routes', () => {
  const mockToken = 'mock-valid-token';
  const mockUser = {
    uid: 'user_123',
    email: 'user@example.com',
    role: 'student',
  };
  const mockAdminUser = {
    uid: 'admin_123',
    email: 'admin@example.com',
    role: 'admin',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockChain.orderBy.mockReturnValue(mockChain);
    mockChain.limit.mockReturnValue(mockChain);
    mockChain.where.mockReturnValue(mockChain);
    mockChain.get.mockResolvedValue({ docs: [] });
  });

  describe('GET /v1/:id (Get Subscription)', () => {
    it('should get subscription for own user', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockUser),
      });

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

      const response = await request(app)
        .get('/v1/sub_123')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.subscription.id).toBe('sub_123');
    });

    it('should return 404 for non-existent subscription', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockUser),
      });

      (subscriptionManager.getSubscription as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/v1/sub_999')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(404);
    });

    it('should forbid viewing subscription for another user', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockUser),
      });

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
        .get('/v1/sub_123')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(403);
    });

    it('should allow admin to view any subscription', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockAdminUser),
      });

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
        .get('/v1/sub_123')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('POST /v1/:id/cancel (Cancel Subscription)', () => {
    it('should cancel own subscription', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockUser),
      });

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
        .post('/v1/sub_123/cancel')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ immediate: false });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /v1/ledger', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/v1/ledger?uid=user_123');

      expect(response.status).toBe(401);
    });

    it('should return 200 for authenticated user', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockUser),
      });

      mockChain.get.mockResolvedValue({ docs: [] });

      const response = await request(app)
        .get('/v1/ledger?uid=user_123&limit=50')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should allow admin to view any user ledger', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockAdminUser),
      });

      mockChain.get.mockResolvedValue({ docs: [] });

      const response = await request(app)
        .get('/v1/ledger?uid=any_user')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('GET /v1/entitlements/:uid', () => {
    it('should get entitlements for user (authenticated)', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockUser),
      });

      const mockEntitlements = {
        uid: 'user_123',
        features: {
          groupReplay: true,
          oneToOne: false,
        },
        updatedAt: new Date(),
      };

      (entitlementService.getEntitlements as jest.Mock).mockResolvedValue(mockEntitlements);

      const response = await request(app)
        .get('/v1/entitlements/user_123')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.entitlements.features.groupReplay).toBe(true);
    });

    it('should get entitlements for user (unauthenticated)', async () => {
      const mockEntitlements = {
        uid: 'user_123',
        features: {
          groupReplay: false,
          oneToOne: false,
        },
        updatedAt: new Date(),
      };

      (entitlementService.getEntitlements as jest.Mock).mockResolvedValue(mockEntitlements);

      const response = await request(app).get('/v1/entitlements/user_123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return default entitlements if none exist', async () => {
      (entitlementService.getEntitlements as jest.Mock).mockResolvedValue(null);

      const response = await request(app).get('/v1/entitlements/user_123');

      expect(response.status).toBe(200);
      expect(response.body.entitlements.features.groupReplay).toBe(false);
      expect(response.body.entitlements.features.oneToOne).toBe(false);
    });

    it('should forbid authenticated user from viewing others entitlements', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockUser),
      });

      const response = await request(app)
        .get('/v1/entitlements/other_user')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /v1/users/:uid/subscriptions', () => {
    it('should get user subscriptions', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockUser),
      });

      const mockSubscriptions = [
        {
          id: 'sub_1',
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
        .get('/v1/users/user_123/subscriptions')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1);
    });

    it('should forbid viewing subscriptions for another user', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockUser),
      });

      const response = await request(app)
        .get('/v1/users/other_user/subscriptions')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /v1/users/:uid/invoices', () => {
    it('should get user invoices', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockUser),
      });

      const mockInvoices = [
        {
          id: 'inv_1',
          uid: 'user_123',
          provider: 'stripe',
          amount: 9.99,
          currency: 'USD',
          status: 'paid',
          createdAt: new Date(),
        },
      ];

      (invoiceService.getUserInvoices as jest.Mock).mockResolvedValue(mockInvoices);

      const response = await request(app)
        .get('/v1/users/user_123/invoices?limit=10')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1);
    });

    it('should use default limit if not specified', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockUser),
      });

      (invoiceService.getUserInvoices as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .get('/v1/users/user_123/invoices')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(invoiceService.getUserInvoices).toHaveBeenCalledWith('user_123', 10);
    });

    it('should forbid viewing invoices for another user', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockUser),
      });

      const response = await request(app)
        .get('/v1/users/other_user/invoices')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(403);
    });
  });
});
