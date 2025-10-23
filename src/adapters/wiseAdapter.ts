import {
  PaymentProviderAdapter,
  CreateSessionParams,
  SessionResult,
  WebhookResult,
  RefundParams,
  RefundResult,
  WiseQuote,
  WiseTransfer,
  Currency,
} from '../types';
import logger from '../lib/logger';
import { collections } from '../lib/firestore';
import axios from 'axios';

interface PreparePayoutParams {
  tutorId: string;
  amount: number;
  currency: Currency;
  beneficiaryDetails?: any;
}

interface ApprovePayoutParams {
  payoutId: string;
}

export class WiseAdapter implements PaymentProviderAdapter {
  private apiKey: string;
  private profileId: string;
  private webhookSecret: string;
  private baseUrl = 'https://api.transferwise.com'; // Mock in development

  constructor() {
    this.apiKey = process.env.WISE_API_KEY || '';
    this.profileId = process.env.WISE_PROFILE_ID || '';
    this.webhookSecret = process.env.WISE_WEBHOOK_SECRET || '';
  }

  /**
   * Not applicable for Wise (payout provider)
   */
  async createSession(params: CreateSessionParams): Promise<SessionResult> {
    logger.warn('createSession not applicable for Wise adapter');
    throw new Error('createSession not applicable for Wise adapter');
  }

  /**
   * Handle Wise webhook events
   */
  async handleWebhook(payload: any, signature?: string): Promise<WebhookResult> {
    try {
      // Verify webhook signature (mock in development)
      if (process.env.NODE_ENV !== 'development') {
        this.verifyWebhookSignature(payload, signature || '');
      }

      const event = payload.data || payload;
      const eventType = event.current_state || event.status;

      logger.info({ eventType, transferId: event.resource?.id }, 'Wise webhook received');

      let processed = true;
      let reason: string | undefined;

      switch (eventType) {
        case 'outgoing_payment_sent':
          await this.handlePayoutCompleted(event);
          break;
        case 'funds_converted':
          await this.handleFundsConverted(event);
          break;
        case 'bounced_back':
        case 'funds_refunded':
          await this.handlePayoutFailed(event);
          break;
        default:
          processed = false;
          reason = `Unhandled event type: ${eventType}`;
      }

      return {
        eventId: event.resource?.id || 'unknown',
        eventType: eventType,
        processed,
        reason,
      };
    } catch (error) {
      logger.error({ error }, 'Wise webhook handling failed');
      throw error;
    }
  }

  /**
   * Refund not applicable for Wise (payout provider)
   */
  async refund(params: RefundParams): Promise<RefundResult> {
    logger.warn('refund not applicable for Wise adapter');
    throw new Error('refund not applicable for Wise adapter');
  }

  /**
   * Prepare a payout (create quote and beneficiary)
   */
  async preparePayout(params: PreparePayoutParams): Promise<string> {
    try {
      const { tutorId, amount, currency, beneficiaryDetails } = params;

      logger.info({ tutorId, amount, currency }, 'Preparing Wise payout (MOCK)');

      // MOCK: In production, create recipient and quote via Wise API
      const quote = await this.createQuoteMock(amount, currency);
      const beneficiary = await this.createBeneficiaryMock(tutorId, beneficiaryDetails);

      // Create payout record
      const payoutId = `payout_${Date.now()}_${tutorId}`;
      await collections.payouts().doc(payoutId).set({
        id: payoutId,
        tutorId,
        amount,
        currency,
        wiseQuoteId: quote.id,
        status: 'queued',
        fxRate: quote.rate,
        fee: quote.fee,
        beneficiaryDetails: beneficiary,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info({ payoutId, tutorId }, 'Payout prepared');
      return payoutId;
    } catch (error) {
      logger.error({ error, params }, 'Failed to prepare payout');
      throw error;
    }
  }

  /**
   * Approve and execute a payout
   */
  async approvePayout(params: ApprovePayoutParams): Promise<void> {
    try {
      const { payoutId } = params;

      const payoutDoc = await collections.payouts().doc(payoutId).get();
      if (!payoutDoc.exists) {
        throw new Error('Payout not found');
      }

      const payout = payoutDoc.data();
      if (payout?.status !== 'queued') {
        throw new Error(`Invalid payout status: ${payout?.status}`);
      }

      logger.info({ payoutId }, 'Approving payout (MOCK)');

      // MOCK: In production, create and fund transfer via Wise API
      const transfer = await this.createTransferMock(payout);

      // Update payout status
      await collections.payouts().doc(payoutId).update({
        wiseTransferId: transfer.id,
        status: 'processing',
        updatedAt: new Date(),
      });

      logger.info({ payoutId, transferId: transfer.id }, 'Payout approved and processing');
    } catch (error) {
      logger.error({ error, params }, 'Failed to approve payout');
      throw error;
    }
  }

  /**
   * Create a quote (MOCK)
   */
  private async createQuoteMock(amount: number, currency: Currency): Promise<WiseQuote> {
    // Mock exchange rate calculation
    const fxRates: Record<string, number> = {
      USD: 1,
      IDR: 15700,
      SGD: 1.35,
      EUR: 0.92,
    };

    const rate = fxRates[currency] || 1;
    const fee = amount * 0.005; // 0.5% fee

    return {
      id: `quote_${Date.now()}`,
      rate,
      fee,
      sourceAmount: amount,
      targetAmount: amount * rate - fee,
    };
  }

  /**
   * Create beneficiary (MOCK)
   */
  private async createBeneficiaryMock(tutorId: string, details?: any): Promise<any> {
    return {
      id: `beneficiary_${tutorId}`,
      name: details?.name || 'Tutor Name',
      accountNumber: details?.accountNumber || '1234567890',
      bankCode: details?.bankCode || 'BANKCODE',
      country: details?.country || 'ID',
    };
  }

  /**
   * Create transfer (MOCK)
   */
  private async createTransferMock(payout: any): Promise<WiseTransfer> {
    return {
      id: `transfer_${Date.now()}`,
      status: 'processing',
      reference: `Payout for ${payout.tutorId}`,
    };
  }

  /**
   * Handle payout completed webhook
   */
  private async handlePayoutCompleted(event: any): Promise<void> {
    const transferId = event.resource?.id;
    
    // Find payout by transfer ID
    const payoutsSnapshot = await collections.payouts()
      .where('wiseTransferId', '==', transferId)
      .limit(1)
      .get();

    if (payoutsSnapshot.empty) {
      logger.warn({ transferId }, 'Payout not found for transfer');
      return;
    }

    const payoutDoc = payoutsSnapshot.docs[0];
    const payout = payoutDoc.data();

    // Update payout status
    await collections.payouts().doc(payoutDoc.id).update({
      status: 'paid',
      updatedAt: new Date(),
    });

    // Write to ledger
    await collections.ledger().add({
      ts: new Date(),
      type: 'payout.paid',
      refId: payoutDoc.id,
      provider: 'wise',
      amount: payout.amount,
      currency: payout.currency,
      uid: payout.tutorId,
      meta: {
        transferId,
        fxRate: payout.fxRate,
        fee: payout.fee,
      },
    });

    logger.info({ payoutId: payoutDoc.id, transferId }, 'Payout completed');
  }

  /**
   * Handle funds converted
   */
  private async handleFundsConverted(event: any): Promise<void> {
    logger.info({ event }, 'Funds converted (logged)');
  }

  /**
   * Handle payout failed webhook
   */
  private async handlePayoutFailed(event: any): Promise<void> {
    const transferId = event.resource?.id;

    const payoutsSnapshot = await collections.payouts()
      .where('wiseTransferId', '==', transferId)
      .limit(1)
      .get();

    if (payoutsSnapshot.empty) {
      logger.warn({ transferId }, 'Payout not found for failed transfer');
      return;
    }

    const payoutDoc = payoutsSnapshot.docs[0];

    await collections.payouts().doc(payoutDoc.id).update({
      status: 'failed',
      updatedAt: new Date(),
      metadata: { reason: event.current_state },
    });

    logger.error({ payoutId: payoutDoc.id, transferId }, 'Payout failed');
  }

  /**
   * Verify webhook signature (mock)
   */
  private verifyWebhookSignature(payload: any, signature: string): void {
    // In production, verify HMAC signature
    // https://docs.wise.com/api-docs/guides/receive-notifications
    if (!signature) {
      throw new Error('Webhook signature missing');
    }
  }

  /**
   * Get payout status
   */
  async getPayoutStatus(payoutId: string): Promise<any> {
    const payoutDoc = await collections.payouts().doc(payoutId).get();
    if (!payoutDoc.exists) {
      throw new Error('Payout not found');
    }
    return payoutDoc.data();
  }
}

export default new WiseAdapter();
