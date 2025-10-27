# API Examples & Testing Guide

This document provides practical examples for testing the payments service API.

## 🎯 Quick Test Scenarios

### 1. Happy Path - Stripe Subscription

**Step 1: Create a subscription**

```bash
curl -X POST http://localhost:3000/v1/stripe/subscriptions \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-key-123" \
  -d '{
    "uid": "user_123",
    "planId": "price_1234567890"
  }'
```

**⚠️ Important about Currency:**
- Currency is **determined by the Price ID**, not the request parameter
- To use IDR (or any currency), you must create a separate Price in Stripe Dashboard with that currency
- Then use that Price ID: `"planId": "price_idr_xxx"`
- The `currency` parameter in the request is optional and informational only

Response (USD - no tax):
```json
{
  "success": true,
  "subscriptionId": "sub_abc123",
  "clientSecret": "pi_xyz_secret_123",
  "sessionId": "sub_abc123",
  "currency": "USD",
  "subtotal": 9.99,
  "tax": 0,
  "total": 9.99
}
```

Response (IDR - with 11% PPN tax):
```json
{
  "success": true,
  "subscriptionId": "sub_def456",
  "clientSecret": "pi_abc_secret_456",
  "sessionId": "sub_def456",
  "currency": "IDR",
  "subtotal": 150000,
  "tax": 16500,
  "total": 166500
}
```

**Note:** Indonesian PPN (11% tax) is automatically applied to IDR subscriptions.

**Step 2: Simulate webhook (payment succeeded)**

```bash
# Use Stripe CLI to trigger webhook
stripe trigger invoice.payment_succeeded

# Or manually POST to webhook endpoint
curl -X POST http://localhost:3000/webhooks/stripe \
  -H "Stripe-Signature: whsec_test_signature" \
  -H "Content-Type: application/json" \
  -d @stripe_invoice_paid.json
```

**Step 3: Check subscription status**

```bash
curl -X GET http://localhost:3000/v1/subscriptions/sub_abc123 \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN"
```

Response:
```json
{
  "success": true,
  "subscription": {
    "id": "sub_abc123",
    "uid": "user_123",
    "provider": "stripe",
    "status": "active",
    "planId": "price_1234567890",
    "currentPeriodStart": "2024-01-01T00:00:00Z",
    "currentPeriodEnd": "2024-02-01T00:00:00Z"
  }
}
```

**Step 4: Check entitlements**

```bash
curl -X GET http://localhost:3000/v1/entitlements/user_123
```

Response:
```json
{
  "success": true,
  "entitlements": {
    "uid": "user_123",
    "features": {
      "oneToOne": true,
      "groupReplay": false
    },
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

### 2. Failed Payment + Dunning

**Step 1: Simulate failed payment**

```bash
stripe trigger invoice.payment_failed
```

**Step 2: Check subscription enters past_due**

```bash
curl -X GET http://localhost:3000/v1/subscriptions/sub_abc123 \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN"
```

Response:
```json
{
  "subscription": {
    "status": "past_due",
    "graceUntil": "2024-01-08T00:00:00Z"
  }
}
```

**Step 3: Run dunning job (T+0)**

```bash
npm run job:dunning
```

Check logs for:
```
Dunning attempt processed: attempt=0, subscriptionId=sub_abc123
Sending dunning reminder (MOCK)
```

**Step 4: Wait or fast-forward to T+7, run dunning again**

After grace period expires, subscription should be canceled:

```bash
npm run job:dunning
```

Subscription status → `canceled`, entitlements revoked.

### 3. IAP Receipt Validation (Mock)

**Validate Apple receipt**

```bash
curl -X POST http://localhost:3000/v1/iap/validate \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "user_456",
    "platform": "ios",
    "receipt": "base64_encoded_receipt_data_here"
  }'
```

Response:
```json
{
  "success": true,
  "valid": true,
  "transactionId": "apple_1234567890",
  "originalTransactionId": "apple_orig_1234567890",
  "productId": "com.edtech.group.premium",
  "purchaseDate": "2024-01-01T00:00:00Z",
  "expiresDate": "2024-02-01T00:00:00Z"
}
```

**Validate Google Play receipt**

```bash
curl -X POST http://localhost:3000/v1/iap/validate \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "user_789",
    "platform": "android",
    "receipt": "google_purchase_token_here"
  }'
```

**IAP Webhook - App Store (Renewal)**

```bash
curl -X POST http://localhost:3000/webhooks/appstore \
  -H "Content-Type: application/json" \
  -d '{
    "notification_type": "DID_RENEW",
    "transaction_id": "apple_1234567890",
    "original_transaction_id": "apple_orig_1234567890"
  }'
```

Response:
```json
{
  "received": true,
  "eventId": "apple_orig_1234567890",
  "eventType": "DID_RENEW",
  "processed": true
}
```

**IAP Webhook - App Store (Renewal Failure)**

```bash
curl -X POST http://localhost:3000/webhooks/appstore \
  -H "Content-Type: application/json" \
  -d '{
    "notification_type": "DID_FAIL_TO_RENEW",
    "original_transaction_id": "apple_orig_1234567890"
  }'
```

**IAP Webhook - App Store (Refund)**

```bash
curl -X POST http://localhost:3000/webhooks/appstore \
  -H "Content-Type: application/json" \
  -d '{
    "notification_type": "REFUND",
    "original_transaction_id": "apple_orig_1234567890"
  }'
```

**IAP Webhook - Google Play (Renewal)**

```bash
curl -X POST http://localhost:3000/webhooks/play \
  -H "Content-Type: application/json" \
  -d '{
    "subscriptionNotification": {
      "notificationType": 2,
      "purchaseToken": "google_purchase_token_123"
    }
  }'
```

**IAP Webhook - Google Play (Cancellation)**

```bash
curl -X POST http://localhost:3000/webhooks/play \
  -H "Content-Type: application/json" \
  -d '{
    "subscriptionNotification": {
      "notificationType": 3,
      "purchaseToken": "google_purchase_token_123"
    }
  }'
```

**Check IAP subscription status**

```bash
curl -X GET http://localhost:3000/v1/iap/subscriptions/user_789 \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN"
```

Response:
```json
{
  "success": true,
  "subscriptions": [
    {
      "id": "apple_orig_1234567890",
      "uid": "user_789",
      "provider": "iap",
      "status": "active",
      "planId": "com.edtech.group.premium",
      "currentPeriodStart": "2024-01-01T00:00:00Z",
      "currentPeriodEnd": "2024-02-01T00:00:00Z",
      "metadata": {
        "platform": "ios",
        "transactionId": "apple_1234567890"
      }
    }
  ]
}
```

### 4. Wise Payout Flow

**Step 1: Prepare payout**

```bash
curl -X POST http://localhost:3000/v1/payouts/prepare \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tutorId": "tutor_123",
    "amount": 500,
    "currency": "USD",
    "beneficiaryDetails": {
      "name": "John Tutor",
      "accountNumber": "1234567890",
      "bankCode": "SWIFT123"
    }
  }'
```

Response:
```json
{
  "success": true,
  "payoutId": "payout_1234567890",
  "status": "queued"
}
```

**Step 2: Approve payout**

```bash
curl -X POST http://localhost:3000/v1/payouts/approve \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payoutId": "payout_1234567890"
  }'
```

Response:
```json
{
  "success": true,
  "payoutId": "payout_1234567890",
  "status": "processing"
}
```

**Step 3: Simulate Wise webhook (payout completed)**

```bash
curl -X POST http://localhost:3000/webhooks/wise \
  -H "X-Signature: mock_signature" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "resource": {
        "id": "transfer_123",
        "type": "transfer"
      },
      "current_state": "outgoing_payment_sent"
    }
  }'
```

**Step 4: Check payout status**

```bash
curl -X GET http://localhost:3000/v1/payouts/payout_1234567890 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Response:
```json
{
  "success": true,
  "payout": {
    "id": "payout_1234567890",
    "tutorId": "tutor_123",
    "status": "paid",
    "amount": 500,
    "currency": "USD",
    "fxRate": 1,
    "fee": 2.5
  }
}
```

### 5. Admin Operations

**List user subscriptions**

```bash
curl -X GET http://localhost:3000/v1/users/user_123/subscriptions \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN"
```

**List user invoices**

```bash
curl -X GET http://localhost:3000/v1/users/user_123/invoices?limit=10 \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN"
```

**View ledger entries**

```bash
curl -X GET "http://localhost:3000/v1/ledger?uid=user_123&limit=50" \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN"
```

Response:
```json
{
  "success": true,
  "entries": [
    {
      "id": "ledger_001",
      "ts": "2024-01-01T00:00:00Z",
      "type": "payment.succeeded",
      "refId": "inv_123",
      "provider": "stripe",
      "amount": 9.99,
      "currency": "USD",
      "uid": "user_123"
    },
    {
      "id": "ledger_002",
      "ts": "2024-01-01T00:00:00Z",
      "type": "subscription.created",
      "refId": "sub_123",
      "provider": "stripe",
      "amount": 0,
      "currency": "USD",
      "uid": "user_123"
    }
  ]
}
```

**Cancel subscription**

```bash
curl -X POST http://localhost:3000/v1/subscriptions/sub_abc123/cancel \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "immediate": false
  }'
```

### 6. Webhook Idempotency Test

**Send same webhook twice**

```bash
# First request
curl -X POST http://localhost:3000/webhooks/stripe \
  -H "Stripe-Signature: whsec_test" \
  -H "Content-Type: application/json" \
  -d '{"id": "evt_test_123", "type": "invoice.payment_succeeded"}'

# Second request (should be idempotent)
curl -X POST http://localhost:3000/webhooks/stripe \
  -H "Stripe-Signature: whsec_test" \
  -H "Content-Type: application/json" \
  -d '{"id": "evt_test_123", "type": "invoice.payment_succeeded"}'
```

Second response:
```json
{
  "received": true,
  "eventId": "evt_test_123",
  "status": "already_processed"
}
```

## 🧪 Test Data

### Sample Stripe Webhook Payloads

**invoice.payment_succeeded.json**
```json
{
  "id": "evt_test_123",
  "type": "invoice.payment_succeeded",
  "data": {
    "object": {
      "id": "in_test_123",
      "customer": "cus_test_123",
      "amount_paid": 999,
      "currency": "usd",
      "status": "paid",
      "subscription": "sub_test_123",
      "lines": {
        "data": [
          {
            "description": "1-to-1 Premium Plan",
            "amount": 999,
            "quantity": 1,
            "price": {
              "id": "price_test_123"
            }
          }
        ]
      },
      "metadata": {
        "uid": "user_123"
      }
    }
  }
}
```

**invoice.payment_failed.json**
```json
{
  "id": "evt_test_456",
  "type": "invoice.payment_failed",
  "data": {
    "object": {
      "id": "in_test_456",
      "customer": "cus_test_123",
      "amount_due": 999,
      "currency": "usd",
      "status": "open",
      "subscription": "sub_test_123",
      "metadata": {
        "uid": "user_123"
      }
    }
  }
}
```

### Sample IAP Webhooks

**Apple App Store Notification**
```json
{
  "notification_type": "DID_RENEW",
  "transaction_id": "1000000123456789",
  "original_transaction_id": "1000000987654321",
  "product_id": "com.edtech.group.premium",
  "auto_renew_status": "true"
}
```

**Google Play Developer Notification**
```json
{
  "message": {
    "data": "base64_encoded_data",
    "messageId": "123456789"
  },
  "subscription": "projects/PROJECT/subscriptions/SUBSCRIPTION"
}
```

Decoded message.data:
```json
{
  "subscriptionNotification": {
    "notificationType": 2,
    "purchaseToken": "token_123456789",
    "subscriptionId": "com.edtech.group.premium"
  }
}
```

## 🎬 Demo Script

Complete flow demonstrating the system:

```bash
#!/bin/bash

echo "=== Payments Service Demo ==="
echo ""

# 1. Create Stripe subscription
echo "1. Creating Stripe subscription..."
SUB_RESPONSE=$(curl -s -X POST http://localhost:3000/v1/stripe/subscriptions \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uid": "demo_user", "planId": "price_demo"}')
echo $SUB_RESPONSE | jq .
SUB_ID=$(echo $SUB_RESPONSE | jq -r .subscriptionId)
echo ""

# 2. Trigger successful payment webhook
echo "2. Simulating successful payment..."
stripe trigger invoice.payment_succeeded
sleep 2
echo ""

# 3. Check subscription status
echo "3. Checking subscription status..."
curl -s http://localhost:3000/v1/subscriptions/$SUB_ID \
  -H "Authorization: Bearer $FIREBASE_TOKEN" | jq .
echo ""

# 4. Check entitlements
echo "4. Checking user entitlements..."
curl -s http://localhost:3000/v1/entitlements/demo_user | jq .
echo ""

# 5. Validate IAP receipt
echo "5. Validating IAP receipt..."
curl -s -X POST http://localhost:3000/v1/iap/validate \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uid": "demo_user_2", "platform": "ios", "receipt": "mock_receipt"}' | jq .
echo ""

# 6. Prepare payout
echo "6. Preparing tutor payout..."
PAYOUT_RESPONSE=$(curl -s -X POST http://localhost:3000/v1/payouts/prepare \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tutorId": "tutor_demo", "amount": 100, "currency": "USD"}')
echo $PAYOUT_RESPONSE | jq .
PAYOUT_ID=$(echo $PAYOUT_RESPONSE | jq -r .payoutId)
echo ""

# 7. Approve payout
echo "7. Approving payout..."
curl -s -X POST http://localhost:3000/v1/payouts/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"payoutId\": \"$PAYOUT_ID\"}" | jq .
echo ""

# 8. View ledger
echo "8. Viewing ledger entries..."
curl -s "http://localhost:3000/v1/ledger?limit=10" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
echo ""

echo "=== Demo Complete ==="
```

## 📝 Notes

- Replace `YOUR_FIREBASE_TOKEN` with actual Firebase ID token
- Use Stripe test mode keys for development
- Mock implementations return successful responses by default
- Check logs for detailed webhook processing information
- All timestamps are in ISO 8601 format (UTC)

## 🐛 Common Errors

### 401 Unauthorized
- Missing or invalid Firebase token
- Use: `await firebase.auth().currentUser.getIdToken()`

### 400 Validation Error
- Check request body matches schema
- Ensure required fields are present

### 403 Forbidden
- User trying to access another user's data
- Admin role required for certain endpoints

### 404 Not Found
- Resource doesn't exist
- Check ID/UID is correct

### 500 Internal Server Error
- Check server logs
- Verify Firestore connection
- Ensure environment variables are set
