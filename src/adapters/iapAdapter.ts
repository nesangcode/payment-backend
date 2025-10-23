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

    // Create subscription record
    await collections.subscriptions().doc(subscriptionId).set({
      id: subscriptionId,
      uid,
      provider: 'iap',
      planId: validation.productId || 'unknown',
      status: 'active',
      currentPeriodStart: validation.purchaseDate || new Date(),
      currentPeriodEnd: validation.expiresDate || new Date(),
      metadata: { platform, transactionId: validation.transactionId },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create invoice
    const invoiceId = `iap_${subscriptionId}_${Date.now()}`;
    await collections.invoices().doc(invoiceId).set({
      id: invoiceId,
      uid,
      provider: 'iap',
      amount: 9.99, // Mock amount
      currency: 'USD',
      status: 'paid',
      subscriptionId,
      lines: [
        {
          description: 'Group & Recording Access',
          amount: 9.99,
          planId: validation.productId,
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

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
      invoiceId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Update entitlements (IAP is for groups/recordings)
    await collections.entitlements().doc(uid).set(
      {
        uid,
        features: {
          groupReplay: true,
          oneToOne: false,
          androidNoReplay: platform === 'android', // Android policy flag
        },
        updatedAt: new Date(),
      },
      { merge: true }
    );

    // Write to ledger
    await collections.ledger().add({
      ts: new Date(),
      type: 'payment.succeeded',
      refId: invoiceId,
      provider: 'iap',
      amount: 9.99,
      currency: 'USD',
      uid,
      meta: {
        platform,
        transactionId: validation.transactionId,
        productId: validation.productId,
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

    logger.info({ uid, subscriptionId, platform }, 'IAP subscription saved');
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

  private async handleIAPRenewal(_payload: any, platform: Platform): Promise<void> {
    logger.info({ platform }, 'IAP renewal (MOCK)');
    // Mock implementation - extract subscription ID and update
  }

  private async handleIAPRenewalFailure(_payload: any, platform: Platform): Promise<void> {
    logger.warn({ platform }, 'IAP renewal failure (MOCK)');
    // Mock implementation - set subscription to past_due
  }

  private async handleIAPRefund(_payload: any, platform: Platform): Promise<void> {
    logger.warn({ platform }, 'IAP refund (MOCK)');
    // Mock implementation - revoke entitlements and log refund
  }

  private async handleIAPCancellation(_payload: any, platform: Platform): Promise<void> {
    logger.info({ platform }, 'IAP cancellation (MOCK)');
    // Mock implementation - set cancelAtPeriodEnd
  }

  private async handleIAPPause(_payload: any, platform: Platform): Promise<void> {
    logger.info({ platform }, 'IAP pause (MOCK)');
    // Mock implementation - set status to paused
  }
}

export default new IAPAdapter();
