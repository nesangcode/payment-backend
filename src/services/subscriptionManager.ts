import {
  Subscription,
  SubscriptionStatus,
  EntitlementFeatures,
} from '../types';
import { collections } from '../lib/firestore';
import logger from '../lib/logger';
import { EntitlementService } from './entitlementService';

const GRACE_DAYS = parseInt(process.env.GRACE_DAYS || '7', 10);

export class SubscriptionManager {
  private entitlementService: EntitlementService;

  constructor() {
    this.entitlementService = new EntitlementService();
  }

  /**
   * Create a new subscription
   */
  async createSubscription(data: Partial<Subscription>): Promise<Subscription> {
    try {
      const subscription: Subscription = {
        id: data.id || `sub_${Date.now()}_${data.uid}`,
        uid: data.uid!,
        provider: data.provider!,
        planId: data.planId!,
        status: data.status || 'incomplete',
        currentPeriodStart: data.currentPeriodStart || new Date(),
        currentPeriodEnd: data.currentPeriodEnd || this.calculatePeriodEnd(new Date()),
        cancelAtPeriodEnd: data.cancelAtPeriodEnd || false,
        metadata: data.metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await collections.subscriptions().doc(subscription.id).set(subscription);

      logger.info(
        { subscriptionId: subscription.id, uid: subscription.uid },
        'Subscription created'
      );

      // Grant entitlements if active
      if (subscription.status === 'active') {
        await this.grantEntitlements(subscription);
      }

      return subscription;
    } catch (error) {
      logger.error({ error, data }, 'Failed to create subscription');
      throw error;
    }
  }

  /**
   * Update subscription status
   */
  async updateSubscriptionStatus(
    subscriptionId: string,
    status: SubscriptionStatus,
    updates?: Partial<Subscription>
  ): Promise<void> {
    try {
      const updateData: any = {
        status,
        updatedAt: new Date(),
        ...updates,
      };

      // Handle grace period for past_due status
      if (status === 'past_due') {
        const graceUntil = new Date();
        graceUntil.setDate(graceUntil.getDate() + GRACE_DAYS);
        updateData.graceUntil = graceUntil;
      }

      await collections.subscriptions().doc(subscriptionId).update(updateData);

      // Get subscription to manage entitlements
      const subDoc = await collections.subscriptions().doc(subscriptionId).get();
      const subscription = subDoc.data() as Subscription;

      // Manage entitlements based on status
      if (['active', 'trialing'].includes(status)) {
        await this.grantEntitlements(subscription);
      } else if (['canceled', 'ended', 'incomplete'].includes(status)) {
        // Check if user has other active subscriptions
        const hasOtherActive = await this.hasOtherActiveSubscriptions(
          subscription.uid,
          subscriptionId
        );
        if (!hasOtherActive) {
          await this.revokeEntitlements(subscription.uid);
        }
      }
      // For past_due, keep entitlements during grace period

      logger.info({ subscriptionId, status }, 'Subscription status updated');
    } catch (error) {
      logger.error({ error, subscriptionId, status }, 'Failed to update subscription status');
      throw error;
    }
  }

  /**
   * Handle subscription renewal
   */
  async renewSubscription(subscriptionId: string): Promise<void> {
    try {
      const subDoc = await collections.subscriptions().doc(subscriptionId).get();
      if (!subDoc.exists) {
        throw new Error('Subscription not found');
      }

      const subscription = subDoc.data() as Subscription;
      const newPeriodStart = subscription.currentPeriodEnd;
      const newPeriodEnd = this.calculatePeriodEnd(newPeriodStart);

      await collections.subscriptions().doc(subscriptionId).update({
        status: 'active',
        currentPeriodStart: newPeriodStart,
        currentPeriodEnd: newPeriodEnd,
        graceUntil: null,
        updatedAt: new Date(),
      });

      // Ensure entitlements are active
      await this.grantEntitlements({ ...subscription, status: 'active' });

      // Write to ledger
      await collections.ledger().add({
        ts: new Date(),
        type: 'subscription.renewed',
        refId: subscriptionId,
        provider: subscription.provider,
        amount: 0,
        currency: 'USD',
        uid: subscription.uid,
        meta: { subscriptionId },
      });

      logger.info({ subscriptionId }, 'Subscription renewed');
    } catch (error) {
      logger.error({ error, subscriptionId }, 'Failed to renew subscription');
      throw error;
    }
  }

  /**
   * Cancel subscription at period end
   */
  async cancelSubscription(subscriptionId: string, immediate = false): Promise<void> {
    try {
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (immediate) {
        updateData.status = 'canceled';
        updateData.currentPeriodEnd = new Date();
      } else {
        updateData.cancelAtPeriodEnd = true;
      }

      await collections.subscriptions().doc(subscriptionId).update(updateData);

      if (immediate) {
        const subDoc = await collections.subscriptions().doc(subscriptionId).get();
        const subscription = subDoc.data() as Subscription;

        // Revoke entitlements immediately
        const hasOtherActive = await this.hasOtherActiveSubscriptions(
          subscription.uid,
          subscriptionId
        );
        if (!hasOtherActive) {
          await this.revokeEntitlements(subscription.uid);
        }

        // Write to ledger
        await collections.ledger().add({
          ts: new Date(),
          type: 'subscription.canceled',
          refId: subscriptionId,
          provider: subscription.provider,
          amount: 0,
          currency: 'USD',
          uid: subscription.uid,
          meta: { subscriptionId, immediate },
        });
      }

      logger.info({ subscriptionId, immediate }, 'Subscription canceled');
    } catch (error) {
      logger.error({ error, subscriptionId }, 'Failed to cancel subscription');
      throw error;
    }
  }

  /**
   * Handle failed renewal (dunning)
   */
  async handleFailedRenewal(subscriptionId: string, attempt: number): Promise<void> {
    try {
      const subDoc = await collections.subscriptions().doc(subscriptionId).get();
      if (!subDoc.exists) {
        return;
      }

      const subscription = subDoc.data() as Subscription;

      if (attempt === 0) {
        // First failure - set to past_due with grace period
        await this.updateSubscriptionStatus(subscriptionId, 'past_due');
        logger.warn({ subscriptionId, attempt }, 'Subscription renewal failed - grace period started');
      } else if (subscription.graceUntil && new Date() > subscription.graceUntil) {
        // Grace period expired - cancel subscription
        await this.updateSubscriptionStatus(subscriptionId, 'canceled');
        await this.revokeEntitlements(subscription.uid);
        logger.error({ subscriptionId }, 'Subscription canceled after grace period expired');
      } else {
        // Still in grace period
        logger.warn({ subscriptionId, attempt }, 'Subscription renewal retry failed');
      }
    } catch (error) {
      logger.error({ error, subscriptionId }, 'Failed to handle failed renewal');
      throw error;
    }
  }

  /**
   * Handle subscription plan change (proration)
   */
  async changePlan(
    subscriptionId: string,
    newPlanId: string,
    prorate = true
  ): Promise<void> {
    try {
      const subDoc = await collections.subscriptions().doc(subscriptionId).get();
      if (!subDoc.exists) {
        throw new Error('Subscription not found');
      }

      const subscription = subDoc.data() as Subscription;
      const oldPlanId = subscription.planId;

      // Calculate proration credit (simplified)
      let prorationCredit = 0;
      if (prorate) {
        const remainingDays = Math.ceil(
          (subscription.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        const totalDays = Math.ceil(
          (subscription.currentPeriodEnd.getTime() - subscription.currentPeriodStart.getTime()) /
            (1000 * 60 * 60 * 24)
        );
        // Simple proration: assume 10% credit per remaining 10% of period
        prorationCredit = (remainingDays / totalDays) * 10;
      }

      await collections.subscriptions().doc(subscriptionId).update({
        planId: newPlanId,
        prorationCredit: prorationCredit > 0 ? prorationCredit : null,
        updatedAt: new Date(),
      });

      logger.info(
        { subscriptionId, oldPlanId, newPlanId, prorationCredit },
        'Subscription plan changed'
      );
    } catch (error) {
      logger.error({ error, subscriptionId, newPlanId }, 'Failed to change plan');
      throw error;
    }
  }

  /**
   * Check if grace period has expired
   */
  async checkGracePeriodExpiry(): Promise<void> {
    try {
      const now = new Date();
      const snapshot = await collections.subscriptions()
        .where('status', '==', 'past_due')
        .where('graceUntil', '<=', now)
        .get();

      const updates: Promise<void>[] = [];
      for (const doc of snapshot.docs) {
        const subscription = doc.data() as Subscription;
        updates.push(
          this.updateSubscriptionStatus(subscription.id, 'canceled').then(() => {
            logger.info({ subscriptionId: subscription.id }, 'Subscription canceled due to expired grace period');
          })
        );
      }

      await Promise.all(updates);
      logger.info({ count: updates.length }, 'Grace period expiry check completed');
    } catch (error) {
      logger.error({ error }, 'Failed to check grace period expiry');
      throw error;
    }
  }

  /**
   * Grant entitlements based on subscription provider
   */
  private async grantEntitlements(subscription: Subscription): Promise<void> {
    const features: Partial<EntitlementFeatures> = {};

    // Stripe = 1-to-1 only
    if (subscription.provider === 'stripe') {
      features.oneToOne = true;
      features.groupReplay = false;
    }
    // IAP = Groups/Recordings
    else if (subscription.provider === 'iap') {
      features.groupReplay = true;
      features.oneToOne = false;
      // Android policy flag
      if (subscription.metadata?.platform === 'android') {
        features.androidNoReplay = true;
      }
    }

    await this.entitlementService.updateEntitlements(subscription.uid, features);
  }

  /**
   * Revoke all entitlements for a user
   */
  private async revokeEntitlements(uid: string): Promise<void> {
    await this.entitlementService.revokeAllEntitlements(uid);
  }

  /**
   * Check if user has other active subscriptions
   */
  private async hasOtherActiveSubscriptions(
    uid: string,
    excludeSubscriptionId: string
  ): Promise<boolean> {
    const snapshot = await collections.subscriptions()
      .where('uid', '==', uid)
      .where('status', 'in', ['active', 'trialing', 'past_due'])
      .get();

    return snapshot.docs.some((doc) => doc.id !== excludeSubscriptionId);
  }

  /**
   * Calculate period end (default: 30 days)
   */
  private calculatePeriodEnd(start: Date): Date {
    const end = new Date(start);
    end.setDate(end.getDate() + 30);
    return end;
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    const doc = await collections.subscriptions().doc(subscriptionId).get();
    return doc.exists ? (doc.data() as Subscription) : null;
  }

  /**
   * Get user's active subscriptions
   */
  async getUserSubscriptions(uid: string): Promise<Subscription[]> {
    const snapshot = await collections.subscriptions()
      .where('uid', '==', uid)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => doc.data() as Subscription);
  }
}

export default new SubscriptionManager();
