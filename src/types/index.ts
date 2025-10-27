// Core type definitions for the payments service

export type Provider = 'stripe' | 'iap' | 'wise' | 'tazapay';
export type Platform = 'ios' | 'android';
export type Currency = 'USD' | 'IDR' | 'SGD' | 'EUR';

// Subscription statuses
export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'trialing'
  | 'paused'
  | 'ended';

// Payment/Invoice statuses
export type InvoiceStatus = 'open' | 'paid' | 'void' | 'uncollectible';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';
export type PayoutStatus = 'queued' | 'processing' | 'paid' | 'failed';
export type WebhookStatus = 'processed' | 'ignored';

// Ledger event types
export type LedgerEventType =
  | 'invoice.created'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'subscription.renewed'
  | 'subscription.created'
  | 'subscription.canceled'
  | 'payout.paid'
  | 'refund.succeeded';

// User & Billing
export interface User {
  uid: string;
  role: 'student' | 'tutor' | 'admin';
  country: string;
  currency: Currency;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingCustomer {
  uid: string;
  stripeCustomerId?: string;
  iapOriginalTransactionId?: string;
  tazapayCustomerId?: string;
  defaultPaymentMethod?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Subscription
export interface Subscription {
  id: string;
  uid: string;
  provider: Provider;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  graceUntil?: Date;
  cancelAtPeriodEnd?: boolean;
  prorationCredit?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Entitlements
export interface EntitlementFeatures {
  groupReplay: boolean;
  oneToOne: boolean;
  androidNoReplay?: boolean; // Policy flag for Android
}

export interface Entitlement {
  uid: string;
  features: EntitlementFeatures;
  updatedAt: Date;
}

// Invoice
export interface InvoiceLine {
  description: string;
  amount: number;
  quantity?: number;
  planId?: string;
}

export interface Invoice {
  id: string;
  uid: string;
  provider: Provider;
  amount: number;
  currency: Currency;
  tax?: number;
  lines: InvoiceLine[];
  status: InvoiceStatus;
  hostedInvoiceUrl?: string;
  subscriptionId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Payment
export interface Payment {
  id: string;
  uid: string;
  provider: Provider;
  amount: number;
  currency: Currency;
  status: PaymentStatus;
  intentId?: string;
  invoiceId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Payout
export interface Payout {
  id: string;
  tutorId: string;
  amount: number;
  currency: Currency;
  wiseQuoteId?: string;
  wiseTransferId?: string;
  status: PayoutStatus;
  fxRate?: number;
  fee?: number;
  beneficiaryDetails?: Record<string, any>;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Ledger
export interface LedgerEntry {
  id: string;
  ts: Date;
  type: LedgerEventType;
  refId: string;
  provider: Provider;
  amount: number;
  currency: Currency;
  uid?: string;
  meta?: Record<string, any>;
}

// Webhook
export interface WebhookEvent {
  id: string;
  provider: Provider;
  rawId: string;
  processedAt: Date;
  dedupKey: string;
  status: WebhookStatus;
  reason?: string;
  rawPayload?: any;
}

// Provider Adapter Interface
export interface PaymentProviderAdapter {
  createSession(params: CreateSessionParams): Promise<SessionResult>;
  handleWebhook(payload: any, signature?: string): Promise<WebhookResult>;
  refund(params: RefundParams): Promise<RefundResult>;
  // Additional methods as needed
}

export interface CreateSessionParams {
  uid: string;
  planId: string;
  currency?: Currency;
  metadata?: Record<string, any>;
}

export interface SessionResult {
  sessionId?: string;
  clientSecret?: string;
  hostedUrl?: string;
  subscriptionId?: string;
  currency?: string;
  subtotal?: number;
  tax?: number;
  total?: number;
}

export interface WebhookResult {
  eventId: string;
  eventType: string;
  processed: boolean;
  reason?: string;
}

export interface RefundParams {
  paymentId: string;
  amount?: number;
  reason?: string;
}

export interface RefundResult {
  refundId: string;
  status: string;
  amount: number;
}

// IAP Receipt Validation
export interface IAPReceipt {
  uid: string;
  platform: Platform;
  receipt: string;
  productId?: string;
}

export interface IAPValidationResult {
  valid: boolean;
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  purchaseDate?: Date;
  expiresDate?: Date;
}

// Wise Payout Types
export interface WiseQuote {
  id: string;
  rate: number;
  fee: number;
  sourceAmount: number;
  targetAmount: number;
}

export interface WiseTransfer {
  id: string;
  status: string;
  reference: string;
}

// Dunning Configuration
export interface DunningConfig {
  attempts: number[];
  graceDay: number;
}

// Plan Configuration (simplified)
export interface Plan {
  id: string;
  name: string;
  provider: Provider;
  amount: number;
  currency: Currency;
  interval: 'month' | 'year';
  features: Partial<EntitlementFeatures>;
}
