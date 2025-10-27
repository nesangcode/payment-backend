# In-App Purchase (IAP) Implementation

## Overview

This document describes the complete IAP implementation for iOS (App Store) and Android (Google Play) in-app purchases. The implementation includes receipt validation, webhook handling, subscription management, and entitlement toggling.

## Architecture

### Key Components

1. **IAP Routes** (`src/routes/iap.routes.ts`)
   - `POST /v1/iap/validate` - Validate IAP receipts
   - `GET /v1/iap/subscriptions/:uid` - Get user's IAP subscriptions

2. **IAP Adapter** (`src/adapters/iapAdapter.ts`)
   - Mock receipt validation for iOS and Android
   - Webhook event handling
   - Subscription lifecycle management

3. **Webhook Endpoints**
   - `POST /webhooks/appstore` - Apple App Store Server Notifications
   - `POST /webhooks/play` - Google Play Developer Notifications

4. **Services Integration**
   - `SubscriptionManager` - Manages subscription state
   - `InvoiceService` - Handles invoice creation and updates
   - `EntitlementService` - Toggles user features

## IAP Features vs Stripe Features

| Provider | Features Granted |
|----------|------------------|
| **Stripe** | `oneToOne: true`, `groupReplay: false` |
| **IAP** | `oneToOne: false`, `groupReplay: true` |

Special handling:
- Android IAP sets `androidNoReplay: true` policy flag when platform is Android

## API Endpoints

### 1. Validate Receipt

**Endpoint:** `POST /v1/iap/validate`

**Request Body:**
```json
{
  "uid": "user_123",
  "platform": "ios",  // or "android"
  "receipt": "base64_encoded_receipt_data",
  "productId": "com.edtech.group.premium"  // optional
}
```

**Response:**
```json
{
  "success": true,
  "valid": true,
  "transactionId": "apple_1234567890",
  "originalTransactionId": "apple_orig_1234567890",
  "productId": "com.edtech.group.premium",
  "purchaseDate": "2024-01-01T00:00:00.000Z",
  "expiresDate": "2024-02-01T00:00:00.000Z"
}
```

**What Happens:**
1. Receipt is validated (MOCK - returns success)
2. Subscription is created via `SubscriptionManager`
3. Invoice is created via `InvoiceService` and marked as paid
4. Payment record is created
5. Entitlements are granted (`groupReplay: true`)
6. Ledger entries are written
7. Billing customer info is saved

### 2. Get IAP Subscriptions

**Endpoint:** `GET /v1/iap/subscriptions/:uid`

**Response:**
```json
{
  "success": true,
  "subscriptions": [
    {
      "id": "apple_orig_1234567890",
      "uid": "user_123",
      "provider": "iap",
      "status": "active",
      "planId": "com.edtech.group.premium",
      "currentPeriodStart": "2024-01-01T00:00:00.000Z",
      "currentPeriodEnd": "2024-02-01T00:00:00.000Z",
      "metadata": {
        "platform": "ios",
        "transactionId": "apple_1234567890"
      }
    }
  ]
}
```

## Webhook Events

### App Store Server Notifications

**Endpoint:** `POST /webhooks/appstore`

Supported notification types:
- `INITIAL_BUY` - First purchase
- `DID_RENEW` - Successful renewal
- `DID_FAIL_TO_RENEW` - Failed renewal (grace period)
- `REFUND` - Refund issued
- `CANCEL` - User cancelled

### Google Play Developer Notifications

**Endpoint:** `POST /webhooks/play`

Supported notification types:
- `1` (SUBSCRIPTION_RECOVERED) - Subscription recovered
- `2` (SUBSCRIPTION_RENEWED) - Successful renewal
- `3` (SUBSCRIPTION_CANCELED) - User cancelled
- `7` (SUBSCRIPTION_RESTARTED) - Subscription restarted
- `10` (SUBSCRIPTION_PAUSED) - Subscription paused
- `11` (SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED) - Pause schedule changed
- `12` (SUBSCRIPTION_REVOKED) - Refund issued

## Webhook Event Handling

### Renewal (DID_RENEW / notificationType: 2)

**Actions:**
1. Extract subscription ID from payload
2. Get existing subscription
3. Calculate new period (30 days from current end)
4. Update subscription status to `active`
5. Clear grace period
6. Create renewal invoice
7. Write to ledger

**Database Updates:**
- `subscriptions/{id}` - status: active, new periods
- `invoices/{id}` - new invoice created
- `ledger` - subscription.renewed entry

### Renewal Failure (DID_FAIL_TO_RENEW)

**Actions:**
1. Set subscription status to `past_due`
2. Set grace period (7 days by default)
3. Write failure to ledger
4. Keep entitlements active during grace period

**Database Updates:**
- `subscriptions/{id}` - status: past_due, graceUntil set
- `ledger` - payment.failed entry

### Refund (REFUND / notificationType: 12)

**Actions:**
1. Cancel subscription immediately
2. Revoke all entitlements
3. Write refund to ledger

**Database Updates:**
- `subscriptions/{id}` - status: canceled, period ended
- `entitlements/{uid}` - all features set to false
- `ledger` - refund.succeeded entry

### Cancellation (CANCEL / notificationType: 3)

**Actions:**
1. Set `cancelAtPeriodEnd: true`
2. User retains access until period ends
3. Write cancellation to ledger

**Database Updates:**
- `subscriptions/{id}` - cancelAtPeriodEnd: true
- `ledger` - subscription.canceled entry

### Pause (notificationType: 10, 11)

**Actions:**
1. Set subscription status to `paused`
2. Temporarily revoke entitlements

**Database Updates:**
- `subscriptions/{id}` - status: paused
- `entitlements/{uid}` - all features set to false

## Idempotency

All webhook endpoints use idempotency middleware to prevent duplicate processing:

1. Generate deduplication key: `{provider}:{eventId}`
2. Check if webhook already processed
3. If processed, return 200 with `status: "already_processed"`
4. If not processed, handle event and mark as processed

**Example Response (Duplicate):**
```json
{
  "received": true,
  "eventId": "apple_orig_1234567890",
  "status": "already_processed"
}
```

## Grace Period Handling

When renewal fails:
1. Subscription enters `past_due` status
2. Grace period set (default 7 days, configurable via `GRACE_DAYS` env var)
3. Entitlements remain active during grace period
4. Dunning job runs daily to check expired grace periods
5. If grace period expires, subscription is canceled and entitlements revoked

## Mock Implementation Notes

⚠️ **This is a MOCK implementation for demonstration purposes**

In production, you would:

### iOS (App Store)
- Use App Store Server API: `https://buy.itunes.apple.com/verifyReceipt`
- Verify receipt signature
- Handle sandbox vs production environments
- Parse actual transaction data from receipt
- Implement JWS verification for Server Notifications v2

### Android (Google Play)
- Use Google Play Developer API
- Verify purchase token with Google's servers
- Handle real-time developer notifications via Pub/Sub
- Implement proper OAuth2 authentication
- Parse actual subscription data

### Current Mock Behavior
- All receipts are considered valid
- Mock transaction IDs are generated
- Mock product ID: `com.edtech.group.premium`
- Mock amount: $9.99 USD
- Mock renewal period: 30 days

## Testing

See `API_EXAMPLES.md` for comprehensive testing examples including:
- Receipt validation (iOS and Android)
- Webhook simulation (renewals, failures, refunds, cancellations)
- Subscription status checks
- Idempotency testing

## Firestore Collections Modified

1. **subscriptions** - Subscription records
2. **invoices** - Invoice records
3. **payments** - Payment records
4. **entitlements** - User feature flags
5. **ledger** - Audit trail
6. **billingCustomers** - Customer metadata
7. **webhookEvents** - Webhook deduplication

## Integration Flow

```
Mobile App
    ↓ (purchase completed)
    ↓ receipt
    ↓
POST /v1/iap/validate
    ↓
IAPAdapter.validateReceipt() [MOCK]
    ↓
SubscriptionManager.createSubscription()
    ↓
    ├─→ Create subscription
    ├─→ Create invoice (InvoiceService)
    ├─→ Create payment
    ├─→ Grant entitlements (groupReplay: true)
    ├─→ Write to ledger
    └─→ Save billing customer
    ↓
Return validation result


App Store / Google Play
    ↓ (webhook event)
    ↓
POST /webhooks/appstore or /webhooks/play
    ↓
Idempotency check
    ↓
IAPAdapter.handleWebhook()
    ↓
    ├─→ Renewal: Update subscription, create invoice, write ledger
    ├─→ Failure: Set past_due, start grace period
    ├─→ Refund: Cancel subscription, revoke entitlements
    ├─→ Cancel: Set cancelAtPeriodEnd
    └─→ Pause: Set status, revoke entitlements
    ↓
Return webhook result
```

## Environment Variables

- `GRACE_DAYS` - Grace period duration (default: 7)
- `IAP_APPLE_SHARED_SECRET` - Apple shared secret (not used in mock)
- `IAP_GOOGLE_SERVICE_ACCOUNT_PATH` - Google service account path (not used in mock)

## Summary

✅ **Implemented:**
- Receipt validation endpoint with mock verification
- App Store and Google Play webhook handlers
- Subscription lifecycle management (renewal, failure, refund, cancel, pause)
- Invoice and payment record creation
- Entitlement toggling (groupReplay for IAP)
- Ledger audit trail
- Webhook idempotency
- Grace period handling for failed renewals

✅ **Integration:**
- Uses SubscriptionManager for consistency
- Uses InvoiceService for invoice handling
- Properly manages entitlements via EntitlementService
- All actions logged to ledger

✅ **Mock Behavior:**
- All receipts validate successfully
- Mock transaction data generated
- Ready for real API integration when needed
