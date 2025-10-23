# System Architecture

## 🏛️ High-Level Design

The payments service is built on a **webhook-driven architecture** where external payment providers (Stripe, Apple/Google IAP, Wise) are the source of truth for all state changes.

```
┌─────────────────────────────────────────────────────────────────┐
│                        External Providers                        │
│  ┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │ Stripe  │    │  Apple   │    │  Google  │    │   Wise   │  │
│  │   API   │    │   IAP    │    │   Play   │    │   API    │  │
│  └────┬────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘  │
└───────┼──────────────┼───────────────┼───────────────┼─────────┘
        │              │               │               │
        │ webhooks     │ webhooks      │ webhooks      │ webhooks
        ▼              ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Payments Service (Node.js)                  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Webhook Handlers (Routes)                    │  │
│  │  /webhooks/stripe  /webhooks/appstore  /webhooks/play     │  │
│  │              /webhooks/wise                               │  │
│  │                                                            │  │
│  │  • Signature verification                                 │  │
│  │  • Idempotency checks (deduplication)                     │  │
│  │  • Event parsing and validation                           │  │
│  └─────────────────────┬────────────────────────────────────┘  │
│                        │                                         │
│                        ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │             Provider Adapters (Strategy Pattern)          │  │
│  │                                                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │   Stripe     │  │     IAP      │  │    Wise      │   │  │
│  │  │   Adapter    │  │   Adapter    │  │   Adapter    │   │  │
│  │  │              │  │              │  │              │   │  │
│  │  │ • Session    │  │ • Receipt    │  │ • Quote      │   │  │
│  │  │ • Refunds    │  │ • Validate   │  │ • Transfer   │   │  │
│  │  │ • Webhooks   │  │ • Webhooks   │  │ • Webhooks   │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  └─────────────────────┬────────────────────────────────────┘  │
│                        │                                         │
│                        ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                 Business Logic Layer                      │  │
│  │                                                            │  │
│  │  ┌─────────────────┐  ┌──────────────┐  ┌─────────────┐ │  │
│  │  │  Subscription   │  │  Entitlement │  │   Invoice   │ │  │
│  │  │    Manager      │  │   Service    │  │   Service   │ │  │
│  │  │                 │  │              │  │             │ │  │
│  │  │ • State machine │  │ • Grant/     │  │ • Create    │ │  │
│  │  │ • Renewals      │  │   Revoke     │  │ • Update    │ │  │
│  │  │ • Cancellation  │  │ • Features   │  │ • Tax       │ │  │
│  │  │ • Grace period  │  │              │  │             │ │  │
│  │  └─────────────────┘  └──────────────┘  └─────────────┘ │  │
│  └─────────────────────┬────────────────────────────────────┘  │
│                        │                                         │
│                        ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Data Layer (Firestore)                  │  │
│  │                                                            │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │  │
│  │  │  users   │ │   subs   │ │ invoices │ │ payments │   │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │  │
│  │  │entitle-  │ │  ledger  │ │ webhooks │ │ payouts  │   │  │
│  │  │  ments   │ │ (append) │ │ (dedup)  │ │          │   │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │               Background Jobs (Cron)                      │  │
│  │                                                            │  │
│  │  ┌──────────────────┐        ┌──────────────────┐       │  │
│  │  │  Dunning Job     │        │  Reconcile Job   │       │  │
│  │  │  (T+0/T+3/T+7)   │        │  (Daily)         │       │  │
│  │  │                  │        │                  │       │  │
│  │  │ • Find past_due  │        │ • Compare ledger │       │  │
│  │  │ • Send reminders │        │   vs provider    │       │  │
│  │  │ • Retry payment  │        │ • Log mismatches │       │  │
│  │  │ • Cancel if fail │        │                  │       │  │
│  │  └──────────────────┘        └──────────────────┘       │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
        │                                              │
        │ API calls (authenticated)                    │
        ▼                                              ▼
┌─────────────────┐                          ┌─────────────────┐
│   Mobile Apps   │                          │   Web Client    │
│  (iOS/Android)  │                          │   (React/etc)   │
└─────────────────┘                          └─────────────────┘
```

## 🔄 Data Flow

### 1. Subscription Creation (Stripe)

```
User → POST /v1/stripe/subscriptions
     → StripeAdapter.createSession()
     → Stripe API (create customer, subscription)
     ← clientSecret
     ← Response to user

User → Uses clientSecret in frontend (Stripe.js)
     → Completes payment

Stripe → POST /webhooks/stripe (invoice.payment_succeeded)
       → Verify signature
       → Check deduplication
       → StripeAdapter.handleWebhook()
       → SubscriptionManager.updateStatus('active')
       → EntitlementService.updateEntitlements()
       → Write to ledger
       → Mark webhook processed
```

### 2. IAP Receipt Validation

```
User → POST /v1/iap/validate (with receipt)
     → IAPAdapter.validateReceipt()
     → Mock validation (in prod: Apple/Google API)
     → Create subscription record
     → Create invoice record
     → Create payment record
     → Update entitlements
     → Write to ledger
     ← Response with validation result

(Later) App Store/Play Store → POST /webhooks/appstore or /webhooks/play
                              → Handle renewal, refund, cancellation
                              → Update records
                              → Toggle entitlements
```

### 3. Failed Payment & Dunning

```
Stripe → POST /webhooks/stripe (invoice.payment_failed)
       → SubscriptionManager.updateStatus('past_due')
       → Set graceUntil = now + 7 days
       → Write to ledger

Cron → npm run job:dunning (T+0)
     → Find past_due subscriptions
     → Send reminder (mock)
     → Regenerate payment link
     → Log attempt

Cron → npm run job:dunning (T+3)
     → Second reminder

Cron → npm run job:dunning (T+7)
     → Check graceUntil expired
     → SubscriptionManager.updateStatus('canceled')
     → EntitlementService.revokeAllEntitlements()
     → Write to ledger
```

### 4. Wise Payout

```
Admin → POST /v1/payouts/prepare
      → WiseAdapter.preparePayout()
      → Create quote (mock)
      → Create beneficiary (mock)
      → Create payout record (status: queued)
      ← payoutId

Admin → POST /v1/payouts/approve
      → WiseAdapter.approvePayout()
      → Create transfer (mock)
      → Update payout (status: processing)

Wise → POST /webhooks/wise (outgoing_payment_sent)
     → Update payout (status: paid)
     → Write to ledger with FX rate & fee
```

## 🎭 Design Patterns

### 1. Strategy Pattern (Provider Adapters)

All providers implement the same interface:

```typescript
interface PaymentProviderAdapter {
  createSession(params): SessionResult;
  handleWebhook(payload, signature): WebhookResult;
  refund(params): RefundResult;
}
```

Benefits:
- Easy to add new providers
- Consistent error handling
- Testable in isolation

### 2. State Machine (Subscription Status)

```
States: incomplete → active → past_due → canceled
                      ↓
                   trialing
```

Enforced in `SubscriptionManager` with clear transitions.

### 3. Event Sourcing (Ledger)

All state changes recorded as immutable events:

```typescript
{
  ts: Date,
  type: 'payment.succeeded' | 'subscription.renewed' | ...,
  refId: string,
  provider: string,
  amount: number,
  currency: string,
  uid: string,
  meta: object
}
```

Benefits:
- Complete audit trail
- Reconciliation possible
- Can rebuild state from events

### 4. Idempotency Pattern

Using deduplication keys:

```typescript
dedupKey = `webhook:${provider}:${eventId}`

if (await isWebhookProcessed(dedupKey)) {
  return { status: 'already_processed' };
}

// Process webhook...

await markWebhookProcessed(dedupKey);
```

## 🔒 Security

### Authentication

- Firebase Auth tokens for API endpoints
- Admin role checks for sensitive operations
- No authentication for webhooks (signature verification instead)

### Webhook Verification

**Stripe**: HMAC-SHA256 signature in `Stripe-Signature` header

```typescript
const event = stripe.webhooks.constructEvent(
  rawBody,
  signature,
  webhookSecret
);
```

**Apple/Google**: JWT verification (not implemented in mock)

**Wise**: HMAC signature (mocked)

### Idempotency Keys

Client-provided or webhook-derived keys prevent duplicate processing:

```
Idempotency-Key: unique-key-123
```

Stored in Firestore with 24-hour TTL.

## 📊 Data Consistency

### ACID Properties

Firestore transactions not used (for simplicity), but consistency ensured via:

1. **Webhooks as source of truth**: All state changes come from providers
2. **Idempotent processing**: Duplicate webhooks don't cause issues
3. **Ledger integrity**: Append-only, never updated or deleted
4. **Grace periods**: Entitlements remain during payment retry window

### Reconciliation

Daily job compares ledger totals vs provider API totals:

```typescript
ledgerTotal = sum(ledger entries where provider=X)
providerTotal = getFromProviderAPI(X)

if (ledgerTotal !== providerTotal) {
  writeAlert();
}
```

## 🚀 Scalability Considerations

### Horizontal Scaling

- Stateless API servers (can run multiple instances)
- Firestore handles concurrent writes
- Background jobs can run on separate instances

### Performance

- Indexed Firestore queries (`where` clauses)
- Webhook processing < 60 seconds (provider timeout)
- Caching for frequently accessed data (entitlements)

### Rate Limiting

Not implemented but recommended:

```typescript
// Express rate limiter
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/v1/', limiter);
```

## 🧪 Testing Strategy

### Unit Tests

- Adapters (mocked external APIs)
- Services (mocked Firestore)
- Idempotency logic

### Integration Tests

- Webhook handlers with mock payloads
- State machine transitions
- Ledger integrity

### E2E Tests (Recommended)

- Full flow with test Stripe account
- Webhook delivery via Stripe CLI
- Verify database state

## 📈 Monitoring & Observability

### Logging (Pino)

Structured JSON logs with levels:

```json
{
  "level": "info",
  "time": "2024-01-01T00:00:00.000Z",
  "msg": "Stripe webhook received",
  "eventType": "invoice.payment_succeeded",
  "eventId": "evt_123"
}
```

### Metrics (Recommended)

- Webhook processing latency
- Failed payment rate
- Dunning success rate
- Provider API error rate

### Alerting (Recommended)

- Failed webhooks
- Grace period expirations
- Reconciliation mismatches
- Provider API downtime

## 🔄 Future Enhancements

1. **Retry Logic**: Exponential backoff for provider API calls
2. **Webhook Replay**: Admin UI to replay failed webhooks
3. **Multi-Region**: Deploy to multiple regions for redundancy
4. **GraphQL API**: Alternative to REST for client flexibility
5. **Real-time Updates**: WebSocket/SSE for live subscription status
6. **Advanced Tax**: Integrate Stripe Tax or similar for accurate calculations
7. **Fraud Detection**: ML models for suspicious transactions
8. **Customer Portal**: Self-service billing management

---

This architecture balances simplicity with production-readiness, following best practices for webhook-driven systems.
