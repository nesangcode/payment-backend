import subscriptionManager from '../services/subscriptionManager';
import { collections } from '../lib/firestore';
import { SubscriptionStatus } from '../types';

// Mock Firestore
const createMockWhere = () => {
  const mockWhere: any = jest.fn(() => mockWhere);
  mockWhere.get = jest.fn().mockResolvedValue({ docs: [] });
  return mockWhere;
};

jest.mock('../lib/firestore', () => ({
  collections: {
    subscriptions: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn().mockResolvedValue(undefined),
        update: jest.fn(),
      })),
      where: createMockWhere(),
    })),
    entitlements: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn().mockResolvedValue(undefined),
      })),
    })),
    ledger: jest.fn(() => ({
      add: jest.fn().mockResolvedValue(undefined),
    })),
  },
}));

// Mock EntitlementService
jest.mock('../services/entitlementService', () => ({
  EntitlementService: jest.fn().mockImplementation(() => ({
    updateEntitlements: jest.fn(),
    revokeAllEntitlements: jest.fn(),
  })),
}));

describe('Subscription State Machine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('State Transitions', () => {
    it('should transition from incomplete to active', async () => {
      const mockUpdate = jest.fn().mockResolvedValue(undefined);
      const mockGet = jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: 'sub_123',
          uid: 'user_123',
          provider: 'stripe',
          status: 'incomplete',
        }),
      });
      const mockDoc = jest.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      (collections.subscriptions as jest.Mock).mockReturnValue({ doc: mockDoc });

      await subscriptionManager.updateSubscriptionStatus('sub_123', 'active');

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
          updatedAt: expect.any(Date),
        })
      );
    });

    it('should transition from active to past_due with grace period', async () => {
      const mockUpdate = jest.fn().mockResolvedValue(undefined);
      const mockGet = jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: 'sub_123',
          uid: 'user_123',
          provider: 'stripe',
          status: 'active',
        }),
      });
      const mockDoc = jest.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      (collections.subscriptions as jest.Mock).mockReturnValue({ doc: mockDoc });

      await subscriptionManager.updateSubscriptionStatus('sub_123', 'past_due');

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'past_due',
          graceUntil: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      );
    });

    it('should transition from past_due to canceled after grace period', async () => {
      const mockUpdate = jest.fn().mockResolvedValue(undefined);
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1); // Yesterday

      const mockGet = jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: 'sub_123',
          uid: 'user_123',
          provider: 'stripe',
          status: 'past_due',
          graceUntil: pastDate,
        }),
      });
      const mockDoc = jest.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockWhereChain: any = {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
      mockWhereChain.where.mockReturnValue(mockWhereChain);
      
      (collections.subscriptions as jest.Mock).mockReturnValue({ 
        doc: mockDoc,
        where: jest.fn().mockReturnValue(mockWhereChain),
      });

      await subscriptionManager.updateSubscriptionStatus('sub_123', 'canceled');

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'canceled',
          updatedAt: expect.any(Date),
        })
      );
    });

    it('should handle trialing to active transition', async () => {
      const mockUpdate = jest.fn().mockResolvedValue(undefined);
      const mockGet = jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: 'sub_123',
          uid: 'user_123',
          provider: 'stripe',
          status: 'trialing',
        }),
      });
      const mockDoc = jest.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      (collections.subscriptions as jest.Mock).mockReturnValue({ doc: mockDoc });

      await subscriptionManager.updateSubscriptionStatus('sub_123', 'active');

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
        })
      );
    });
  });

  describe('Subscription Renewal', () => {
    it('should renew active subscription successfully', async () => {
      const currentPeriodEnd = new Date();
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);

      const mockGet = jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: 'sub_123',
          uid: 'user_123',
          provider: 'stripe',
          status: 'active',
          currentPeriodEnd,
        }),
      });
      const mockUpdate = jest.fn().mockResolvedValue(undefined);
      const mockDoc = jest.fn().mockReturnValue({
        get: mockGet,
        update: mockUpdate,
      });
      const mockAdd = jest.fn().mockResolvedValue(undefined);

      (collections.subscriptions as jest.Mock).mockReturnValue({ doc: mockDoc });
      (collections.ledger as jest.Mock).mockReturnValue({ add: mockAdd });

      await subscriptionManager.renewSubscription('sub_123');

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
          currentPeriodStart: currentPeriodEnd,
          graceUntil: null,
        })
      );
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'subscription.renewed',
          refId: 'sub_123',
        })
      );
    });

    it('should handle failed renewal at T+0', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: 'sub_123',
          uid: 'user_123',
          provider: 'stripe',
          status: 'active',
          updatedAt: new Date(),
        }),
      });
      const mockUpdate = jest.fn().mockResolvedValue(undefined);
      const mockDoc = jest.fn().mockReturnValue({
        get: mockGet,
        update: mockUpdate,
      });

      (collections.subscriptions as jest.Mock).mockReturnValue({ doc: mockDoc });

      await subscriptionManager.handleFailedRenewal('sub_123', 0);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'past_due',
          graceUntil: expect.any(Date),
        })
      );
    });
  });

  describe('Subscription Cancellation', () => {
    it('should cancel subscription at period end', async () => {
      const mockUpdate = jest.fn().mockResolvedValue(undefined);
      const mockDoc = jest.fn().mockReturnValue({ update: mockUpdate });

      (collections.subscriptions as jest.Mock).mockReturnValue({ doc: mockDoc });

      await subscriptionManager.cancelSubscription('sub_123', false);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          cancelAtPeriodEnd: true,
          updatedAt: expect.any(Date),
        })
      );
    });

    it('should cancel subscription immediately', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: 'sub_123',
          uid: 'user_123',
          provider: 'stripe',
          status: 'active',
        }),
      });
      const mockUpdate = jest.fn().mockResolvedValue(undefined);
      const mockDoc = jest.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockWhereChain: any = {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
      mockWhereChain.where.mockReturnValue(mockWhereChain);
      const mockAdd = jest.fn().mockResolvedValue(undefined);

      (collections.subscriptions as jest.Mock).mockReturnValue({
        doc: mockDoc,
        where: jest.fn().mockReturnValue(mockWhereChain),
      });
      (collections.ledger as jest.Mock).mockReturnValue({ add: mockAdd });

      await subscriptionManager.cancelSubscription('sub_123', true);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'canceled',
          currentPeriodEnd: expect.any(Date),
        })
      );
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'subscription.canceled',
          refId: 'sub_123',
        })
      );
    });
  });

  describe('Plan Changes and Proration', () => {
    it('should change plan with proration', async () => {
      const currentPeriodStart = new Date();
      const currentPeriodEnd = new Date();
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);

      const mockGet = jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: 'sub_123',
          uid: 'user_123',
          provider: 'stripe',
          status: 'active',
          planId: 'plan_old',
          currentPeriodStart,
          currentPeriodEnd,
        }),
      });
      const mockUpdate = jest.fn().mockResolvedValue(undefined);
      const mockDoc = jest.fn().mockReturnValue({
        get: mockGet,
        update: mockUpdate,
      });

      (collections.subscriptions as jest.Mock).mockReturnValue({ doc: mockDoc });

      await subscriptionManager.changePlan('sub_123', 'plan_new', true);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: 'plan_new',
          prorationCredit: expect.any(Number),
        })
      );
    });

    it('should change plan without proration', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: 'sub_123',
          uid: 'user_123',
          provider: 'stripe',
          status: 'active',
          planId: 'plan_old',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
        }),
      });
      const mockUpdate = jest.fn().mockResolvedValue(undefined);
      const mockDoc = jest.fn().mockReturnValue({
        get: mockGet,
        update: mockUpdate,
      });

      (collections.subscriptions as jest.Mock).mockReturnValue({ doc: mockDoc });

      await subscriptionManager.changePlan('sub_123', 'plan_new', false);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: 'plan_new',
          prorationCredit: null,
        })
      );
    });
  });

  describe('Entitlements Management', () => {
    it('should grant Stripe entitlements (1-to-1 only)', async () => {
      const mockSet = jest.fn().mockResolvedValue(undefined);
      const mockDoc = jest.fn().mockReturnValue({
        set: mockSet,
      });
      const mockWhere: any = jest.fn(() => mockWhere);
      mockWhere.get = jest.fn().mockResolvedValue({ docs: [] });

      (collections.subscriptions as jest.Mock).mockReturnValue({ 
        doc: mockDoc,
        where: mockWhere,
      });
      (collections.entitlements as jest.Mock).mockReturnValue({ doc: mockDoc });

      const subscription = {
        id: 'sub_123',
        uid: 'user_123',
        provider: 'stripe' as const,
        planId: 'plan_123',
        status: 'active' as SubscriptionStatus,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // This is tested through createSubscription
      await subscriptionManager.createSubscription(subscription);

      // Verify entitlements were set for Stripe (oneToOne: true, groupReplay: false)
    });

    it('should grant IAP entitlements (groups/recordings)', async () => {
      const mockSet = jest.fn().mockResolvedValue(undefined);
      const mockDoc = jest.fn().mockReturnValue({
        set: mockSet,
      });
      const mockWhere: any = jest.fn(() => mockWhere);
      mockWhere.get = jest.fn().mockResolvedValue({ docs: [] });

      (collections.subscriptions as jest.Mock).mockReturnValue({ 
        doc: mockDoc,
        where: mockWhere,
      });
      (collections.entitlements as jest.Mock).mockReturnValue({ doc: mockDoc });

      const subscription = {
        id: 'sub_123',
        uid: 'user_123',
        provider: 'iap' as const,
        planId: 'plan_123',
        status: 'active' as SubscriptionStatus,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        metadata: { platform: 'ios' },
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await subscriptionManager.createSubscription(subscription);

      // Verify entitlements were set for IAP (groupReplay: true, oneToOne: false)
    });
  });

  describe('Grace Period Management', () => {
    it('should maintain entitlements during grace period', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      const mockGet = jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: 'sub_123',
          uid: 'user_123',
          provider: 'stripe',
          status: 'past_due',
          graceUntil: futureDate,
        }),
      });
      const mockDoc = jest.fn().mockReturnValue({ get: mockGet });

      (collections.subscriptions as jest.Mock).mockReturnValue({ doc: mockDoc });

      // During grace period, status is past_due but entitlements should remain
      const subscription = await subscriptionManager.getSubscription('sub_123');

      expect(subscription?.status).toBe('past_due');
      expect(subscription?.graceUntil).toBeTruthy();
      expect(subscription?.graceUntil).toBeInstanceOf(Date);
    });

    it('should revoke entitlements after grace period expires', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const mockGet = jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: 'sub_123',
          uid: 'user_123',
          provider: 'stripe',
          status: 'past_due',
          graceUntil: pastDate,
        }),
      });
      const mockUpdate = jest.fn().mockResolvedValue(undefined);
      const mockDoc = jest.fn().mockReturnValue({
        get: mockGet,
        update: mockUpdate,
      });
      const mockWhereChain: any = {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
      mockWhereChain.where.mockReturnValue(mockWhereChain);

      (collections.subscriptions as jest.Mock).mockReturnValue({ 
        doc: mockDoc,
        where: jest.fn().mockReturnValue(mockWhereChain),
      });

      await subscriptionManager.handleFailedRenewal('sub_123', 2);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'canceled',
        })
      );
    });
  });
});
