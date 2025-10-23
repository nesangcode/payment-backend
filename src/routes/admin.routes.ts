import { Router, Response } from 'express';
import { AuthRequest, authenticateUser, requireAdmin, optionalAuth } from '../lib/auth';
import subscriptionManager from '../services/subscriptionManager';
import invoiceService from '../services/invoiceService';
import entitlementService from '../services/entitlementService';
import { collections } from '../lib/firestore';
import logger from '../lib/logger';

const router = Router();

/**
 * Get subscription by ID
 * GET /v1/subscriptions/:id
 */
router.get(
  '/:id',
  authenticateUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const subscriptionId = req.params.id;

      const subscription = await subscriptionManager.getSubscription(subscriptionId);

      if (!subscription) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Subscription not found',
        });
      }

      // Verify user is authorized
      if (req.user?.uid !== subscription.uid && req.user?.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot view subscription for another user',
        });
      }

      return res.status(200).json({
        success: true,
        subscription,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get subscription');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }
);

/**
 * Cancel subscription
 * POST /v1/subscriptions/:id/cancel
 */
router.post(
  '/:id/cancel',
  authenticateUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const subscriptionId = req.params.id;
      const immediate = req.body.immediate === true;

      const subscription = await subscriptionManager.getSubscription(subscriptionId);

      if (!subscription) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Subscription not found',
        });
      }

      // Verify user is authorized
      if (req.user?.uid !== subscription.uid && req.user?.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot cancel subscription for another user',
        });
      }

      await subscriptionManager.cancelSubscription(subscriptionId, immediate);

      return res.status(200).json({
        success: true,
        subscriptionId,
        message: immediate
          ? 'Subscription canceled immediately'
          : 'Subscription will cancel at period end',
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to cancel subscription');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }
);

/**
 * Get invoice by ID
 * GET /v1/invoices/:id
 */
router.get(
  '/:id',
  authenticateUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const invoiceId = req.params.id;

      const invoice = await invoiceService.getInvoice(invoiceId);

      if (!invoice) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Invoice not found',
        });
      }

      // Verify user is authorized
      if (req.user?.uid !== invoice.uid && req.user?.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot view invoice for another user',
        });
      }

      return res.status(200).json({
        success: true,
        invoice,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get invoice');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }
);

/**
 * Get ledger entries
 * GET /v1/ledger?uid=...&limit=...
 */
router.get(
  '/ledger',
  authenticateUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.query.uid as string;
      const limit = parseInt(req.query.limit as string) || 50;

      // Verify user is authorized
      if (req.user?.uid !== uid && req.user?.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot view ledger for another user',
        });
      }

      let query = collections.ledger().orderBy('ts', 'desc').limit(limit);

      if (uid) {
        query = collections.ledger()
          .where('uid', '==', uid)
          .orderBy('ts', 'desc')
          .limit(limit) as any;
      }

      const snapshot = await query.get();
      const entries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      return res.status(200).json({
        success: true,
        entries,
        count: entries.length,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get ledger entries');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }
);

/**
 * Get user entitlements
 * GET /v1/entitlements/:uid
 */
router.get(
  '/entitlements/:uid',
  optionalAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.params.uid;

      // Verify user is authorized (but allow unauthenticated for public access)
      if (req.user && req.user.uid !== uid && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot view entitlements for another user',
        });
      }

      const entitlements = await entitlementService.getEntitlements(uid);

      return res.status(200).json({
        success: true,
        entitlements: entitlements || {
          uid,
          features: {
            groupReplay: false,
            oneToOne: false,
          },
          updatedAt: new Date(),
        },
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get entitlements');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }
);

/**
 * Get user's subscriptions
 * GET /v1/users/:uid/subscriptions
 */
router.get(
  '/users/:uid/subscriptions',
  authenticateUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.params.uid;

      // Verify user is authorized
      if (req.user?.uid !== uid && req.user?.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot view subscriptions for another user',
        });
      }

      const subscriptions = await subscriptionManager.getUserSubscriptions(uid);

      return res.status(200).json({
        success: true,
        subscriptions,
        count: subscriptions.length,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get user subscriptions');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }
);

/**
 * Get user's invoices
 * GET /v1/users/:uid/invoices
 */
router.get(
  '/users/:uid/invoices',
  authenticateUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.params.uid;
      const limit = parseInt(req.query.limit as string) || 10;

      // Verify user is authorized
      if (req.user?.uid !== uid && req.user?.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot view invoices for another user',
        });
      }

      const invoices = await invoiceService.getUserInvoices(uid, limit);

      return res.status(200).json({
        success: true,
        invoices,
        count: invoices.length,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get user invoices');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }
);

export default router;
