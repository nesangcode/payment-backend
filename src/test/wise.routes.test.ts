import request from 'supertest';
import express from 'express';
import wiseRoutes from '../routes/wise.routes';
import wiseAdapter from '../adapters/wiseAdapter';
import admin from 'firebase-admin';

// Mock dependencies
jest.mock('../adapters/wiseAdapter');
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
app.use('/v1/payouts', wiseRoutes);

describe('Wise/Payout Routes', () => {
  const mockToken = 'mock-valid-token';
  const mockAdminUser = {
    uid: 'admin_123',
    email: 'admin@example.com',
    role: 'admin',
  };
  const mockRegularUser = {
    uid: 'user_123',
    email: 'user@example.com',
    role: 'student',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /v1/payouts/prepare', () => {
    it('should prepare payout successfully as admin', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockAdminUser),
      });

      const mockPayoutId = 'payout_123';
      (wiseAdapter.preparePayout as jest.Mock).mockResolvedValue(mockPayoutId);

      const response = await request(app)
        .post('/v1/payouts/prepare')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          tutorId: 'tutor_456',
          amount: 100.50,
          currency: 'USD',
          beneficiaryDetails: {
            accountNumber: '1234567890',
            bankCode: 'BANK123',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.payoutId).toBe(mockPayoutId);
      expect(response.body.status).toBe('queued');
      expect(wiseAdapter.preparePayout).toHaveBeenCalledWith({
        tutorId: 'tutor_456',
        amount: 100.50,
        currency: 'USD',
        beneficiaryDetails: {
          accountNumber: '1234567890',
          bankCode: 'BANK123',
        },
      });
    });

    it('should reject non-admin users', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockRegularUser),
      });

      const response = await request(app)
        .post('/v1/payouts/prepare')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          tutorId: 'tutor_456',
          amount: 100.50,
          currency: 'USD',
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toContain('Admin access required');
    });

    it('should reject invalid amount', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockAdminUser),
      });

      const response = await request(app)
        .post('/v1/payouts/prepare')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          tutorId: 'tutor_456',
          amount: -50, // Negative amount
          currency: 'USD',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });

    it('should reject missing required fields', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockAdminUser),
      });

      const response = await request(app)
        .post('/v1/payouts/prepare')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          tutorId: 'tutor_456',
          // Missing amount and currency
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/v1/payouts/prepare')
        .send({
          tutorId: 'tutor_456',
          amount: 100,
          currency: 'USD',
        });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /v1/payouts/approve', () => {
    it('should approve payout successfully as admin', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockAdminUser),
      });

      (wiseAdapter.approvePayout as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/v1/payouts/approve')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          payoutId: 'payout_123',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe('processing');
      expect(wiseAdapter.approvePayout).toHaveBeenCalledWith({
        payoutId: 'payout_123',
      });
    });

    it('should reject non-admin users', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockRegularUser),
      });

      const response = await request(app)
        .post('/v1/payouts/approve')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          payoutId: 'payout_123',
        });

      expect(response.status).toBe(403);
    });

    it('should reject missing payoutId', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockAdminUser),
      });

      const response = await request(app)
        .post('/v1/payouts/approve')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('GET /v1/payouts/:id', () => {
    it('should get payout status', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockRegularUser),
      });

      const mockPayout = {
        id: 'payout_123',
        tutorId: 'tutor_456',
        amount: 100.50,
        currency: 'USD',
        status: 'completed',
        createdAt: new Date(),
      };

      (wiseAdapter.getPayoutStatus as jest.Mock).mockResolvedValue(mockPayout);

      const response = await request(app)
        .get('/v1/payouts/payout_123')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.payout).toMatchObject({
        id: 'payout_123',
        amount: 100.50,
        status: 'completed',
      });
    });

    it('should return 404 for non-existent payout', async () => {
      (admin.auth as jest.Mock).mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockRegularUser),
      });

      (wiseAdapter.getPayoutStatus as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/v1/payouts/payout_999')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not Found');
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/v1/payouts/payout_123');

      expect(response.status).toBe(401);
    });
  });
});
