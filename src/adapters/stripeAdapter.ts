import Stripe from 'stripe';
import {
  PaymentProviderAdapter,
  CreateSessionParams,
  SessionResult,
  WebhookResult,
  RefundParams,
  RefundResult,
} from '../types';
import logger from '../lib/logger';
import { collections } from '../lib/firestore';

export class StripeAdapter implements PaymentProviderAdapter {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2023-10-16',
    });

    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  }

  /**
   * Create a Stripe subscription session
   */
  async createSession(params: CreateSessionParams): Promise<SessionResult> {
    try {
      const { uid, planId, currency, metadata = {} } = params;

      // Get or create Stripe customer
      const customer = await this.getOrCreateCustomer(uid);

      // Fetch the Price to determine its currency
      const price = await this.stripe.prices.retrieve(planId);
      const priceCurrency = price.currency.toUpperCase();

      // Log if currency parameter is provided but differs from Price currency
      if (currency && currency.toUpperCase() !== priceCurrency) {
        logger.warn(
          { requestedCurrency: currency, actualCurrency: priceCurrency, planId },
          '⚠️  Currency parameter differs from Price currency. Price currency will be used.'
        );
      }

      // Get or create Indonesian tax rate for IDR subscriptions
      let defaultTaxRates: string[] = [];
      if (priceCurrency === 'IDR') {
        const taxRate = await this.getOrCreateIndonesianTaxRate();
        defaultTaxRates = [taxRate.id];
        logger.info({ taxRateId: taxRate.id }, 'Applying Indonesian PPN 11% tax to subscription');
      }

      // Create subscription with tax if applicable
      const subscriptionParams: any = {
        customer: customer.id,
        items: [{ price: planId }],
        payment_behavior: 'default_incomplete',
        payment_settings: {
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription',
        },
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          uid,
          currency: priceCurrency,
          ...metadata,
        },
      };

      // Add tax rates if applicable
      if (defaultTaxRates.length > 0) {
        subscriptionParams.default_tax_rates = defaultTaxRates;
      }

      const subscription = await this.stripe.subscriptions.create(subscriptionParams);

      const invoice = subscription.latest_invoice as Stripe.Invoice;
      const paymentIntent = invoice?.payment_intent as Stripe.PaymentIntent;

      // Calculate tax information
      const invoiceAmount = invoice?.amount_due ? invoice.amount_due / 100 : 0;
      const invoiceTax = invoice?.tax ? invoice.tax / 100 : 0;
      const invoiceSubtotal = invoice?.subtotal ? invoice.subtotal / 100 : 0;

      logger.info(
        { 
          uid, 
          subscriptionId: subscription.id,
          currency: priceCurrency,
          subtotal: invoiceSubtotal,
          tax: invoiceTax,
          total: invoiceAmount,
        },
        'Stripe subscription created with tax'
      );

      // Save subscription to Firestore immediately (also saved via webhook later)
      await collections.subscriptions().doc(subscription.id).set({
        id: subscription.id,
        uid,
        provider: 'stripe',
        planId,
        currency: priceCurrency,
        status: subscription.status as any,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        tax: invoiceTax,
        metadata: {
          ...metadata,
          uid,
          currency: priceCurrency,
          hasTax: invoiceTax > 0,
        },
        createdAt: new Date(subscription.created * 1000),
        updatedAt: new Date(),
      });

      logger.info(
        { uid, subscriptionId: subscription.id },
        'Subscription saved to Firestore'
      );

      return {
        subscriptionId: subscription.id,
        clientSecret: paymentIntent?.client_secret || undefined,
        sessionId: subscription.id,
        currency: priceCurrency,
        subtotal: invoiceSubtotal,
        tax: invoiceTax,
        total: invoiceAmount,
      };
    } catch (error) {
      logger.error({ error, params }, 'Failed to create Stripe session');
      throw error;
    }
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(payload: any, signature?: string): Promise<WebhookResult> {
    try {
      const skipSignatureVerification = process.env.SKIP_STRIPE_SIGNATURE_VERIFICATION === 'true';
      let event: any;

      if (skipSignatureVerification) {
        // Testing mode: parse payload directly without signature verification
        logger.warn('⚠️  Stripe signature verification SKIPPED (testing mode)');
        
        // Handle Buffer, string, or already-parsed object
        if (Buffer.isBuffer(payload)) {
          event = JSON.parse(payload.toString('utf-8'));
        } else if (typeof payload === 'string') {
          event = JSON.parse(payload);
        } else {
          event = payload;
        }
      } else {
        if (!signature) {
          throw new Error('Webhook signature is required');
        }

        // Production mode: verify webhook signature
        event = this.stripe.webhooks.constructEvent(
          payload,
          signature,
          this.webhookSecret
        );
      }

      logger.info({ 
        eventType: event.type, 
        eventId: event.id,
        hasType: !!event.type,
        hasId: !!event.id,
        eventKeys: Object.keys(event || {}).join(', ')
      }, 'Stripe webhook received');

      // DEBUG: Log full event structure if type/id missing
      if (!event.type || !event.id) {
        logger.error({ event: JSON.stringify(event).substring(0, 500) }, '❌ Event missing type or id!');
      }

      // Process event based on type
      let processed = true;
      let reason: string | undefined;

      switch (event.type) {
        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event);
          break;
        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event);
          break;
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event);
          break;
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event);
          break;
        case 'charge.refunded':
          await this.handleChargeRefunded(event);
          break;
        default:
          processed = false;
          reason = `Unhandled event type: ${event.type}`;
          logger.info({ eventType: event.type }, 'Unhandled Stripe event');
      }

      return {
        eventId: event.id,
        eventType: event.type,
        processed,
        reason,
      };
    } catch (error) {
      logger.error({ error }, 'Stripe webhook handling failed');
      throw error;
    }
  }

  /**
   * Refund a payment
   */
  async refund(params: RefundParams): Promise<RefundResult> {
    try {
      const { paymentId, amount, reason } = params;

      const refund = await this.stripe.refunds.create({
        payment_intent: paymentId,
        amount: amount ? Math.round(amount * 100) : undefined,
        reason: reason as Stripe.RefundCreateParams.Reason,
      });

      logger.info({ refundId: refund.id, paymentId }, 'Stripe refund created');

      return {
        refundId: refund.id,
        status: refund.status || 'unknown',
        amount: refund.amount / 100,
      };
    } catch (error) {
      logger.error({ error, params }, 'Stripe refund failed');
      throw error;
    }
  }

  /**
   * Get or create a Stripe customer for a user
   */
  private async getOrCreateCustomer(uid: string): Promise<Stripe.Customer> {
    const billingDoc = await collections.billingCustomers().doc(uid).get();
    const billingData = billingDoc.data();

    if (billingData?.stripeCustomerId) {
      try {
        const customer = await this.stripe.customers.retrieve(
          billingData.stripeCustomerId
        );
        if (!customer.deleted) {
          return customer as Stripe.Customer;
        }
      } catch (error) {
        logger.warn({ uid, error }, 'Failed to retrieve existing Stripe customer');
      }
    }

    // Create new customer
    const userDoc = await collections.users().doc(uid).get();
    const userData = userDoc.data();

    const customer = await this.stripe.customers.create({
      metadata: { uid },
      email: userData?.email,
    });

    // Save customer ID
    await collections.billingCustomers().doc(uid).set(
      {
        uid,
        stripeCustomerId: customer.id,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    logger.info({ uid, customerId: customer.id }, 'Stripe customer created');
    return customer;
  }

  /**
   * Get or create Indonesian PPN tax rate (11%)
   * Caches the tax rate ID to avoid creating duplicates
   */
  private indonesianTaxRateId: string | null = null;

  private async getOrCreateIndonesianTaxRate(): Promise<Stripe.TaxRate> {
    // Return cached tax rate if available
    if (this.indonesianTaxRateId) {
      try {
        return await this.stripe.taxRates.retrieve(this.indonesianTaxRateId);
      } catch (error) {
        logger.warn('Cached tax rate not found, will create new one');
        this.indonesianTaxRateId = null;
      }
    }

    // Get PPN rate from environment (default 11%)
    const ppnRate = parseFloat(process.env.INDONESIA_PPN_RATE || '0.11');
    const ppnPercentage = ppnRate * 100; // Convert to percentage

    // Check if tax rate already exists
    const existingRates = await this.stripe.taxRates.list({
      active: true,
      limit: 100,
    });

    const existingPPNRate = existingRates.data.find(
      (rate) =>
        rate.display_name === 'Indonesian PPN' &&
        rate.percentage === ppnPercentage &&
        rate.jurisdiction === 'ID'
    );

    if (existingPPNRate) {
      this.indonesianTaxRateId = existingPPNRate.id;
      logger.info({ taxRateId: existingPPNRate.id }, 'Using existing Indonesian PPN tax rate');
      return existingPPNRate;
    }

    // Create new tax rate
    const taxRate = await this.stripe.taxRates.create({
      display_name: 'Indonesian PPN',
      description: 'Indonesian Value Added Tax (PPN)',
      jurisdiction: 'ID',
      percentage: ppnPercentage,
      inclusive: false, // Tax is added on top of the price
      active: true,
    });

    this.indonesianTaxRateId = taxRate.id;
    logger.info(
      { taxRateId: taxRate.id, percentage: ppnPercentage },
      'Created new Indonesian PPN tax rate'
    );

    return taxRate;
  }

  private async handleInvoicePaymentSucceeded(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const uid = invoice.metadata?.uid || invoice.customer as string;

    logger.info({ 
      eventId: event.id,
      invoiceId: invoice.id,
      uid,
      customer: invoice.customer,
      metadata: invoice.metadata,
    }, '🔍 DEBUG: Processing invoice.payment_succeeded');

    // Create/update invoice record
    await collections.invoices().doc(invoice.id).set({
      id: invoice.id,
      uid,
      provider: 'stripe',
      amount: invoice.amount_paid / 100,
      currency: invoice.currency.toUpperCase(),
      tax: invoice.tax ? invoice.tax / 100 : 0,
      status: 'paid',
      subscriptionId: invoice.subscription as string,
      hostedInvoiceUrl: invoice.hosted_invoice_url || undefined,
      lines: invoice.lines.data.map((line) => ({
        description: line.description || '',
        amount: line.amount / 100,
        quantity: line.quantity,
        planId: line.price?.id,
      })),
      createdAt: new Date(invoice.created * 1000),
      updatedAt: new Date(),
    });

    // Create payment record
    const paymentId = invoice.payment_intent as string;
    if (paymentId) {
      await collections.payments().doc(paymentId).set({
        id: paymentId,
        uid,
        provider: 'stripe',
        amount: invoice.amount_paid / 100,
        currency: invoice.currency.toUpperCase(),
        status: 'succeeded',
        intentId: paymentId,
        invoiceId: invoice.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Write to ledger
    await collections.ledger().add({
      ts: new Date(),
      type: 'payment.succeeded',
      refId: invoice.id,
      provider: 'stripe',
      amount: invoice.amount_paid / 100,
      currency: invoice.currency.toUpperCase(),
      uid,
      meta: { invoiceId: invoice.id, subscriptionId: invoice.subscription },
    });

    logger.info({ invoiceId: invoice.id, uid }, 'Invoice payment succeeded');
  }

  private async handleInvoicePaymentFailed(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const uid = invoice.metadata?.uid || invoice.customer as string;

    // Update subscription to past_due
    if (invoice.subscription) {
      await collections.subscriptions().doc(invoice.subscription as string).update({
        status: 'past_due',
        updatedAt: new Date(),
      });
    }

    // Write to ledger
    await collections.ledger().add({
      ts: new Date(),
      type: 'payment.failed',
      refId: invoice.id,
      provider: 'stripe',
      amount: invoice.amount_due / 100,
      currency: invoice.currency.toUpperCase(),
      uid,
      meta: { invoiceId: invoice.id, subscriptionId: invoice.subscription },
    });

    logger.warn({ invoiceId: invoice.id, uid }, 'Invoice payment failed');
  }

  private async handleSubscriptionCreated(event: Stripe.Event): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const uid = subscription.metadata.uid || subscription.customer as string;

    await collections.subscriptions().doc(subscription.id).set({
      id: subscription.id,
      uid,
      provider: 'stripe',
      planId: subscription.items.data[0]?.price.id || '',
      status: subscription.status as any,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      metadata: subscription.metadata,
      createdAt: new Date(subscription.created * 1000),
      updatedAt: new Date(),
    });

    await collections.ledger().add({
      ts: new Date(),
      type: 'subscription.created',
      refId: subscription.id,
      provider: 'stripe',
      amount: 0,
      currency: subscription.items.data[0]?.price.currency?.toUpperCase() || 'USD',
      uid,
      meta: { subscriptionId: subscription.id },
    });

    logger.info({ subscriptionId: subscription.id, uid }, 'Subscription created');
  }

  private async handleSubscriptionUpdated(event: Stripe.Event): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const uid = subscription.metadata.uid || subscription.customer as string;

    await collections.subscriptions().doc(subscription.id).update({
      status: subscription.status as any,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      updatedAt: new Date(),
    });

    // If status is active, update entitlements
    if (subscription.status === 'active') {
      await this.updateEntitlements(uid, true);

      await collections.ledger().add({
        ts: new Date(),
        type: 'subscription.renewed',
        refId: subscription.id,
        provider: 'stripe',
        amount: 0,
        currency: subscription.items.data[0]?.price.currency?.toUpperCase() || 'USD',
        uid,
        meta: { subscriptionId: subscription.id },
      });
    }

    logger.info({ subscriptionId: subscription.id, uid, status: subscription.status }, 'Subscription updated');
  }

  private async handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const uid = subscription.metadata.uid || subscription.customer as string;

    await collections.subscriptions().doc(subscription.id).update({
      status: 'canceled',
      updatedAt: new Date(),
    });

    // Revoke entitlements
    await this.updateEntitlements(uid, false);

    await collections.ledger().add({
      ts: new Date(),
      type: 'subscription.canceled',
      refId: subscription.id,
      provider: 'stripe',
      amount: 0,
      currency: subscription.items.data[0]?.price.currency?.toUpperCase() || 'USD',
      uid,
      meta: { subscriptionId: subscription.id },
    });

    logger.info({ subscriptionId: subscription.id, uid }, 'Subscription deleted');
  }

  private async handleChargeRefunded(event: Stripe.Event): Promise<void> {
    const charge = event.data.object as Stripe.Charge;
    const uid = charge.metadata?.uid || charge.customer as string;

    await collections.ledger().add({
      ts: new Date(),
      type: 'refund.succeeded',
      refId: charge.id,
      provider: 'stripe',
      amount: charge.amount_refunded / 100,
      currency: charge.currency.toUpperCase(),
      uid,
      meta: { chargeId: charge.id, paymentIntent: charge.payment_intent },
    });

    logger.info({ chargeId: charge.id, uid }, 'Charge refunded');
  }

  private async updateEntitlements(uid: string, active: boolean): Promise<void> {
    await collections.entitlements().doc(uid).set(
      {
        uid,
        features: {
          oneToOne: active,
          groupReplay: false, // Stripe is for 1-to-1 only
        },
        updatedAt: new Date(),
      },
      { merge: true }
    );
  }

  /**
   * Create setup intent for payment method changes
   */
  async createSetupIntent(uid: string): Promise<string> {
    try {
      const customer = await this.getOrCreateCustomer(uid);

      const setupIntent = await this.stripe.setupIntents.create({
        customer: customer.id,
        payment_method_types: ['card'],
      });

      return setupIntent.client_secret || '';
    } catch (error) {
      logger.error({ error, uid }, 'Failed to create setup intent');
      throw error;
    }
  }
}

export default new StripeAdapter();
