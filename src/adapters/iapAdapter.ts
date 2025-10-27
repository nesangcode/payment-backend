import {
  PaymentProviderAdapter,
  CreateSessionParams,
  SessionResult,
  WebhookResult,
  RefundParams,
  RefundResult,
  IAPReceipt,
  IAPValidationResult,
  Platform,
} from '../types';
import logger from '../lib/logger';
import { collections } from '../lib/firestore';
import subscriptionManager from '../services/subscriptionManager';
import invoiceService from '../services/invoiceService';

export class IAPAdapter implements PaymentProviderAdapter {
  constructor() {
    // Configuration would be loaded from environment variables
    // Apple Shared Secret: process.env.IAP_APPLE_SHARED_SECRET
    // Google Service Account: process.env.IAP_GOOGLE_SERVICE_ACCOUNT_PATH
  }

  /**
   * IAP doesn't create sessions - purchases happen client-side
   */
  async createSession(params: CreateSessionParams): Promise<SessionResult> {
    logger.info({ params }, 'IAP createSession called - not applicable');
    return {
      sessionId: 'iap-client-side',
    };
  }

  /**
   * Handle IAP webhook events (App Store Server Notifications / Google Play Developer Notifications)
   */
  async handleWebhook(payload: any): Promise<WebhookResult> {
    try {
      // Determine platform from payload structure
      const platform = this.detectPlatform(payload);

      if (platform === 'ios') {
        return await this.handleAppleWebhook(payload);
      } else if (platform === 'android') {
        return await this.handleGoogleWebhook(payload);
      }

      return {
        eventId: 'unknown',
        eventType: 'unknown',
        processed: false,
        reason: 'Unknown platform',
      };
    } catch (error) {
      logger.error({ error }, 'IAP webhook handling failed');
      throw error;
    }
  }

  /**
   * Refund not directly supported via IAP API - must be done through store consoles
   */
  async refund(params: RefundParams): Promise<RefundResult> {
    logger.warn({ params }, 'IAP refunds must be processed through store consoles');
    throw new Error('IAP refunds must be processed through App Store Connect or Google Play Console');
  }

  /**
   * Validate IAP receipt (mock implementation for demo)
   */
  async validateReceipt(receipt: IAPReceipt): Promise<IAPValidationResult> {
    try {
      const { platform, receipt: receiptData, uid } = receipt;

      if (platform === 'ios') {
        return await this.validateAppleReceipt(receiptData, uid);
      } else if (platform === 'android') {
        return await this.validateGoogleReceipt(receiptData, uid);
      }

      throw new Error('Invalid platform');
    } catch (error) {
      logger.error({ error, receipt }, 'Receipt validation failed');
      throw error;
    }
  }

  /**
   * Validate Apple receipt (MOCK - in production use App Store Server API)
   */
  private async validateAppleReceipt(
    _receiptData: string,
    uid: string
  ): Promise<IAPValidationResult> {
    logger.info({ uid }, 'Validating Apple receipt (MOCK)');

    // MOCK validation - in production, call verifyReceipt API
    // https://developer.apple.com/documentation/appstorereceipts/verifyreceipt
    
    const mockResult: IAPValidationResult = {
      valid: true,
      transactionId: `apple_${Date.now()}`,
      originalTransactionId: `apple_orig_${Date.now()}`,
      productId: 'com.edtech.group.premium',
      purchaseDate: new Date(),
      expiresDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    };

    // Save to Firestore
    await this.saveIAPSubscription(uid, 'ios', mockResult);

    return mockResult;
  }

  /**
   * Validate Google Play receipt (MOCK - in production use Google Play Developer API)
   */
  private async validateGoogleReceipt(
    _receiptData: string,
    uid: string
  ): Promise<IAPValidationResult> {
    logger.info({ uid }, 'Validating Google Play receipt (MOCK)');

    // MOCK validation - in production, use Google Play Developer API
    // https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptions/get

    const mockResult: IAPValidationResult = {
      valid: true,
      transactionId: `google_${Date.now()}`,
      originalTransactionId: `google_orig_${Date.now()}`,
      productId: 'com.edtech.group.premium',
      purchaseDate: new Date(),
      expiresDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    };

    // Save to Firestore
    await this.saveIAPSubscription(uid, 'android', mockResult);

    return mockResult;
  }

  /**
   * Save IAP subscription to Firestore
   */
  private async saveIAPSubscription(
    uid: string,
    platform: Platform,
    validation: IAPValidationResult
  ): Promise<void> {
    const subscriptionId = validation.originalTransactionId || validation.transactionId || '';

    // Create subscription using SubscriptionManager
    await subscriptionManager.createSubscription({
      id: subscriptionId,
      uid,
      provider: 'iap',
      planId: validation.productId || 'com.edtech.group.premium',
      status: 'active',
      currentPeriodStart: validation.purchaseDate || new Date(),
      currentPeriodEnd: validation.expiresDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      metadata: { platform, transactionId: validation.transactionId },
    });

    // Create invoice using InvoiceService
    const invoice = await invoiceService.createInvoice({
      uid,
      provider: 'iap',
      amount: 9.99, // Mock amount
      currency: 'USD',
      lines: [
        {
          description: 'Group & Recording Access',
          amount: 9.99,
          planId: validation.productId || 'com.edtech.group.premium',
        },
      ],
      subscriptionId,
    });

    // Mark invoice as paid
    await invoiceService.markAsPaid(invoice.id);

    // Create payment record
    const paymentId = `iap_payment_${Date.now()}`;
    await collections.payments().doc(paymentId).set({
      id: paymentId,
      uid,
      provider: 'iap',
      amount: 9.99,
      currency: 'USD',
      status: 'succeeded',
      intentId: validation.transactionId,
      invoiceId: invoice.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Write payment success to ledger
    await collections.ledger().add({
      ts: new Date(),
      type: 'payment.succeeded',
      refId: invoice.id,
      provider: 'iap',
      amount: 9.99,
      currency: 'USD',
      uid,
      meta: {
        platform,
        transactionId: validation.transactionId,
        productId: validation.productId,
        paymentId,
      },
    });

    // Save billing customer info
    await collections.billingCustomers().doc(uid).set(
      {
        uid,
        iapOriginalTransactionId: validation.originalTransactionId,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    logger.info({ uid, subscriptionId, platform, invoiceId: invoice.id }, 'IAP subscription saved');
  }

  /**
   * Detect platform from webhook payload
   */
  private detectPlatform(payload: any): Platform | null {
    if (payload.notification_type || payload.unified_receipt) {
      return 'ios';
    } else if (payload.message?.data || payload.subscriptionNotification) {
      return 'android';
    }
    return null;
  }

  /**
   * Handle Apple App Store webhook
   */
  private async handleAppleWebhook(payload: any): Promise<WebhookResult> {
    const notificationType = payload.notification_type || payload.notificationType;
    const transactionId = payload.transaction_id || payload.original_transaction_id || 'unknown';

    logger.info({ notificationType, transactionId }, 'Apple webhook received');

    let processed = true;
    let reason: string | undefined;

    switch (notificationType) {
      case 'INITIAL_BUY':
      case 'DID_RENEW':
        await this.handleIAPRenewal(payload, 'ios');
        break;
      case 'DID_FAIL_TO_RENEW':
        await this.handleIAPRenewalFailure(payload, 'ios');
        break;
      case 'REFUND':
        await this.handleIAPRefund(payload, 'ios');
        break;
      case 'CANCEL':
        await this.handleIAPCancellation(payload, 'ios');
        break;
      default:
        processed = false;
        reason = `Unhandled notification type: ${notificationType}`;
    }

    return {
      eventId: transactionId,
      eventType: notificationType,
      processed,
      reason,
    };
  }

  /**
   * Handle Google Play webhook
   */
  private async handleGoogleWebhook(payload: any): Promise<WebhookResult> {
    const notificationType = payload.subscriptionNotification?.notificationType;
    const purchaseToken = payload.subscriptionNotification?.purchaseToken || 'unknown';

    logger.info({ notificationType, purchaseToken }, 'Google Play webhook received');

    let processed = true;
    let reason: string | undefined;

    switch (notificationType) {
      case 1: // SUBSCRIPTION_RECOVERED
      case 2: // SUBSCRIPTION_RENEWED
      case 7: // SUBSCRIPTION_RESTARTED
        await this.handleIAPRenewal(payload, 'android');
        break;
      case 3: // SUBSCRIPTION_CANCELED
        await this.handleIAPCancellation(payload, 'android');
        break;
      case 12: // SUBSCRIPTION_REVOKED (refund)
        await this.handleIAPRefund(payload, 'android');
        break;
      case 10: // SUBSCRIPTION_PAUSED
      case 11: // SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED
        await this.handleIAPPause(payload, 'android');
        break;
      default:
        processed = false;
        reason = `Unhandled notification type: ${notificationType}`;
    }

    return {
      eventId: purchaseToken,
      eventType: `google_${notificationType}`,
      processed,
      reason,
    };
  }

  private async handleIAPRenewal(payload: any, platform: Platform): Promise<void> {
    logger.info({ platform, payload }, 'IAP renewal (MOCK)');
    
    // Extract subscription info from payload (MOCK)
    const subscriptionId = this.extractSubscriptionId(payload, platform);
    
    if (!subscriptionId) {
      logger.warn({ platform }, 'Could not extract subscription ID from renewal payload');
      return;
    }

    // Get subscription
    const subDoc = await collections.subscriptions().doc(subscriptionId).get();
    if (!subDoc.exists) {
      logger.warn({ subscriptionId }, 'Subscription not found for renewal');
      return;
    }

    const subscription = subDoc.data() as any;
    if (!subscription) {
      logger.warn({ subscriptionId }, 'Subscription data is empty');
      return;
    }

    const newPeriodStart = subscription.currentPeriodEnd || new Date();
    const newPeriodEnd = new Date(newPeriodStart);
    newPeriodEnd.setDate(newPeriodEnd.getDate() + 30); // 30 days renewal

    // Update subscription
    await collections.subscriptions().doc(subscriptionId).update({
      status: 'active',
      currentPeriodStart: newPeriodStart,
      currentPeriodEnd: newPeriodEnd,
      graceUntil: null,
      updatedAt: new Date(),
    });

    // Create invoice for the renewal
    const invoiceId = `iap_renewal_${subscriptionId}_${Date.now()}`;
    await collections.invoices().doc(invoiceId).set({
      id: invoiceId,
      uid: subscription.uid,
      provider: 'iap',
      amount: 9.99,
      currency: 'USD',
      status: 'paid',
      subscriptionId,
      lines: [
        {
          description: 'Subscription Renewal - Group & Recording Access',
          amount: 9.99,
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Write to ledger
    await collections.ledger().add({
      ts: new Date(),
      type: 'subscription.renewed',
      refId: subscriptionId,
      provider: 'iap',
      amount: 9.99,
      currency: 'USD',
      uid: subscription.uid,
      meta: { subscriptionId, platform, invoiceId },
    });

    logger.info({ subscriptionId, platform }, 'IAP subscription renewed');
  }

  private async handleIAPRenewalFailure(payload: any, platform: Platform): Promise<void> {
    logger.warn({ platform, payload }, 'IAP renewal failure (MOCK)');
    
    const subscriptionId = this.extractSubscriptionId(payload, platform);
    
    if (!subscriptionId) {
      logger.warn({ platform }, 'Could not extract subscription ID from renewal failure payload');
      return;
    }

    // Get subscription
    const subDoc = await collections.subscriptions().doc(subscriptionId).get();
    if (!subDoc.exists) {
      logger.warn({ subscriptionId }, 'Subscription not found for renewal failure');
      return;
    }

    const subscription = subDoc.data() as any;
    if (!subscription) {
      logger.warn({ subscriptionId }, 'Subscription data is empty');
      return;
    }

    const graceUntil = new Date();
    graceUntil.setDate(graceUntil.getDate() + parseInt(process.env.GRACE_DAYS || '7', 10));

    // Set subscription to past_due with grace period
    await collections.subscriptions().doc(subscriptionId).update({
      status: 'past_due',
      graceUntil,
      updatedAt: new Date(),
    });

    // Write to ledger
    await collections.ledger().add({
      ts: new Date(),
      type: 'payment.failed',
      refId: subscriptionId,
      provider: 'iap',
      amount: 0,
      currency: 'USD',
      uid: subscription.uid,
      meta: { subscriptionId, platform, graceUntil },
    });

    logger.warn({ subscriptionId, platform, graceUntil }, 'IAP subscription set to past_due with grace period');
  }

  private async handleIAPRefund(payload: any, platform: Platform): Promise<void> {
    logger.warn({ platform, payload }, 'IAP refund (MOCK)');
    
    const subscriptionId = this.extractSubscriptionId(payload, platform);
    
    if (!subscriptionId) {
      logger.warn({ platform }, 'Could not extract subscription ID from refund payload');
      return;
    }

    // Get subscription
    const subDoc = await collections.subscriptions().doc(subscriptionId).get();
    if (!subDoc.exists) {
      logger.warn({ subscriptionId }, 'Subscription not found for refund');
      return;
    }

    const subscription = subDoc.data() as any;
    if (!subscription) {
      logger.warn({ subscriptionId }, 'Subscription data is empty');
      return;
    }

    // Cancel subscription immediately
    await collections.subscriptions().doc(subscriptionId).update({
      status: 'canceled',
      currentPeriodEnd: new Date(),
      updatedAt: new Date(),
    });

    // Revoke entitlements
    await collections.entitlements().doc(subscription.uid).set(
      {
        uid: subscription.uid,
        features: {
          groupReplay: false,
          oneToOne: false,
          androidNoReplay: false,
        },
        updatedAt: new Date(),
      },
      { merge: true }
    );

    // Write refund to ledger
    await collections.ledger().add({
      ts: new Date(),
      type: 'refund.succeeded',
      refId: subscriptionId,
      provider: 'iap',
      amount: 9.99,
      currency: 'USD',
      uid: subscription.uid,
      meta: { subscriptionId, platform, reason: 'refund' },
    });

    logger.warn({ subscriptionId, platform }, 'IAP subscription refunded and entitlements revoked');
  }

  private async handleIAPCancellation(payload: any, platform: Platform): Promise<void> {
    try {
      logger.info({ platform, payload }, 'IAP cancellation (MOCK)');
      
      const subscriptionId = this.extractSubscriptionId(payload, platform);
      
      if (!subscriptionId) {
        logger.warn({ platform }, 'Could not extract subscription ID from cancellation payload');
        return;
      }

      // Get subscription
      const subDoc = await collections.subscriptions().doc(subscriptionId).get();
      if (!subDoc.exists) {
        logger.warn({ subscriptionId }, 'Subscription not found for cancellation - this is expected for test webhooks');
        return;
      }

      const subscription = subDoc.data() as any;
      if (!subscription) {
        logger.warn({ subscriptionId }, 'Subscription data is empty');
        return;
      }

      // Set to cancel at period end (user retains access until period ends)
      await collections.subscriptions().doc(subscriptionId).update({
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      });

      // Write to ledger
      await collections.ledger().add({
        ts: new Date(),
        type: 'subscription.canceled',
        refId: subscriptionId,
        provider: 'iap',
        amount: 0,
        currency: 'USD',
        uid: subscription.uid,
        meta: { subscriptionId, platform, cancelAtPeriodEnd: true },
      });

      logger.info({ subscriptionId, platform }, 'IAP subscription set to cancel at period end');
    } catch (error) {
      logger.error({ error, platform }, 'Error in handleIAPCancellation - continuing anyway');
      // Don't throw - let webhook continue
    }
  }

  private async handleIAPPause(payload: any, platform: Platform): Promise<void> {
    logger.info({ platform, payload }, 'IAP pause (MOCK)');
    
    const subscriptionId = this.extractSubscriptionId(payload, platform);
    
    if (!subscriptionId) {
      logger.warn({ platform }, 'Could not extract subscription ID from pause payload');
      return;
    }

    // Get subscription
    const subDoc = await collections.subscriptions().doc(subscriptionId).get();
    if (!subDoc.exists) {
      logger.warn({ subscriptionId }, 'Subscription not found for pause');
      return;
    }

    const subscription = subDoc.data() as any;
    if (!subscription) {
      logger.warn({ subscriptionId }, 'Subscription data is empty');
      return;
    }

    // Set subscription to paused
    await collections.subscriptions().doc(subscriptionId).update({
      status: 'paused',
      updatedAt: new Date(),
    });

    // Temporarily revoke entitlements
    await collections.entitlements().doc(subscription.uid).set(
      {
        uid: subscription.uid,
        features: {
          groupReplay: false,
          oneToOne: false,
          androidNoReplay: false,
        },
        updatedAt: new Date(),
      },
      { merge: true }
    );

    logger.info({ subscriptionId, platform }, 'IAP subscription paused');
  }

  /**
   * Extract subscription ID from webhook payload (MOCK)
   */
  private extractSubscriptionId(payload: any, platform: Platform): string | null {
    // MOCK extraction - in production, parse actual payload structure
    if (platform === 'ios') {
      return payload.original_transaction_id || payload.transaction_id || null;
    } else if (platform === 'android') {
      return payload.subscriptionNotification?.purchaseToken || payload.purchaseToken || null;
    }
    return null;
  }
}

export default new IAPAdapter();
