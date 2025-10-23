import {
  PaymentProviderAdapter,
  CreateSessionParams,
  SessionResult,
  WebhookResult,
  RefundParams,
  RefundResult,
} from '../types';
import logger from '../lib/logger';

/**
 * TazaPay Adapter (STUB)
 * 
 * TazaPay is a payment gateway for emerging markets.
 * This is a stub implementation to demonstrate the adapter pattern.
 * 
 * In production, this would integrate with TazaPay API:
 * - Create checkout sessions
 * - Handle webhook notifications
 * - Process refunds
 * - Support local payment methods (e.g., Indonesian e-wallets, bank transfers)
 */
export class TazaPayAdapter implements PaymentProviderAdapter {
  private apiKey: string;
  private webhookSecret: string;

  constructor() {
    this.apiKey = process.env.TAZAPAY_API_KEY || '';
    this.webhookSecret = process.env.TAZAPAY_WEBHOOK_SECRET || '';
    logger.info('TazaPay adapter initialized (STUB)');
  }

  /**
   * Create a TazaPay payment session (STUB)
   */
  async createSession(params: CreateSessionParams): Promise<SessionResult> {
    logger.info({ params }, 'TazaPay createSession (STUB) - not implemented');
    
    // In production, would call TazaPay API to create checkout session
    return {
      sessionId: `tazapay_session_${Date.now()}`,
      hostedUrl: 'https://checkout.tazapay.com/mock-session',
    };
  }

  /**
   * Handle TazaPay webhook (STUB)
   */
  async handleWebhook(payload: any, signature?: string): Promise<WebhookResult> {
    logger.info({ payload }, 'TazaPay webhook received (STUB) - not implemented');

    // In production, would:
    // 1. Verify webhook signature
    // 2. Process payment events
    // 3. Update subscription/invoice records
    // 4. Write to ledger

    return {
      eventId: payload.id || 'unknown',
      eventType: payload.event_type || 'unknown',
      processed: false,
      reason: 'TazaPay adapter is a stub - not implemented',
    };
  }

  /**
   * Process refund via TazaPay (STUB)
   */
  async refund(params: RefundParams): Promise<RefundResult> {
    logger.info({ params }, 'TazaPay refund (STUB) - not implemented');

    // In production, would call TazaPay refund API
    return {
      refundId: `tazapay_refund_${Date.now()}`,
      status: 'pending',
      amount: params.amount || 0,
    };
  }
}

export default new TazaPayAdapter();
