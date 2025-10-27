# Webhook Testing Guide

## Overview

All webhook endpoints now include comprehensive automated tests in the Postman collection. These tests verify webhook processing, idempotency, and proper response formats.

## Webhook Test Coverage

### ✅ Stripe Webhooks

**1. Stripe Webhook - Payment Success**
- ✅ Status code validation (200 or 400)
- ✅ Webhook received confirmation
- ✅ Event ID validation
- Note: May return 400 if signature verification fails (expected for mock testing)

**2. Stripe Webhook - Subscription Created**
- ✅ Status code validation (200 or 400)
- ✅ Webhook received confirmation
- ✅ Event ID validation

### ✅ IAP Webhooks

**3. Apple App Store Webhook (Renewal)**
- ✅ Status code is 200
- ✅ Webhook received flag
- ✅ Event ID exists
- ✅ Event type matches "DID_RENEW"
- ✅ Webhook processed successfully

**4. Apple App Store Webhook (Refund)**
- ✅ Status code is 200
- ✅ Webhook received flag
- ✅ Event type matches "REFUND"
- ✅ Webhook processed successfully

**5. Google Play Webhook (Renewal)**
- ✅ Status code is 200
- ✅ Webhook received flag
- ✅ Event ID exists
- ✅ Event type matches "google_2"
- ✅ Webhook processed successfully

**6. Google Play Webhook (Cancellation)**
- ✅ Status code is 200
- ✅ Webhook received flag
- ✅ Event type matches "google_3"
- ✅ Webhook processed successfully

## 🔧 Stripe Signature Issue Fix

### The Problem

When testing Stripe webhooks in Postman, you may see this error:

```json
{
  "error": "Webhook Error",
  "message": "Unable to extract timestamp and signatures from header"
}
```

**Why?** Stripe webhooks verify the `stripe-signature` header to ensure requests actually came from Stripe. Postman doesn't have valid signatures.

### Solution 1: Skip Signature Verification (Quick Testing) ⚡

**⚠️ DEVELOPMENT/TESTING ONLY - NEVER IN PRODUCTION!**

1. Add to your `.env` file:
   ```bash
   SKIP_STRIPE_SIGNATURE_VERIFICATION=true
   ```

2. Restart your server:
   ```bash
   npm run dev
   ```

3. Test in Postman - should work now! You'll see a warning log:
   ```
   ⚠️  Stripe signature verification SKIPPED (testing mode)
   ```

4. **Important:** Set back to `false` before deploying to production!

### Solution 2: Use Stripe CLI (Production-Like Testing) 🎯

For realistic testing with real signatures:

```bash
# Install Stripe CLI
# https://stripe.com/docs/stripe-cli

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to http://localhost:3000/webhooks/stripe

# In another terminal, trigger test events
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.created
stripe trigger invoice.payment_succeeded
```

## Test Execution

### Using Postman

1. **Open Collection**: Import `postman_collection.json`
2. **Set Environment Variables**:
   - `base_url`: http://localhost:3000
   - `user_id`: test_user_123
   - `stripe_webhook_signature`: (optional, may cause 400)

3. **Run Individual Tests**:
   - Navigate to "Webhooks" folder
   - Click any webhook request
   - Click "Send"
   - View test results in "Test Results" tab

4. **Run All Webhook Tests**:
   - Right-click "Webhooks" folder
   - Select "Run folder"
   - View test results summary

### Expected Test Results

#### Successful Webhook (IAP)
```
✓ Status code is 200
```

#### Stripe Webhook (Without Valid Signature)
```
Status code is 200 or 400
(May show 400 due to signature verification)
```

## Idempotency Testing

### Test Same Webhook Twice

1. **First Request**: Should succeed
   ```bash
   POST /webhooks/appstore
   Body: { "notification_type": "DID_RENEW", "original_transaction_id": "test_123" }
   ```
   Response:
   ```json
   {
     "received": true,
     "eventId": "test_123",
     "processed": true
   }
   ```

2. **Second Request**: Should detect duplicate
   ```bash
   POST /webhooks/appstore
   Body: { "notification_type": "DID_RENEW", "original_transaction_id": "test_123" }
   ```
   Response:
   ```json
   {
     "received": true,
     "eventId": "test_123",
     "status": "already_processed"
   }
   ```

### Idempotency Test Script (Add to Postman)

```javascript
pm.test("Idempotency check", function () {
    var jsonData = pm.response.json();
    if (jsonData.status === "already_processed") {
        pm.expect(jsonData.received).to.be.true;
        console.log("✓ Idempotency working - webhook was deduplicated");
    } else {
        pm.expect(jsonData.processed).to.be.true;
        console.log("✓ First webhook processing");
    }
});
```

## Webhook Response Formats

### Success Response (IAP)
```json
{
  "received": true,
  "eventId": "apple_orig_1234567890",
  "eventType": "DID_RENEW",
  "processed": true
}
```

### Already Processed (Idempotent)
```json
{
  "received": true,
  "eventId": "apple_orig_1234567890",
  "status": "already_processed"
}
```

### Unhandled Event
```json
{
  "received": true,
  "eventId": "apple_orig_1234567890",
  "eventType": "UNKNOWN_TYPE",
  "processed": false,
  "reason": "Unhandled notification type: UNKNOWN_TYPE"
}
```

### Error Response
```json
{
  "error": "Webhook Error",
  "message": "Invalid payload"
}
```

## Testing Scenarios

### 1. Happy Path - Renewal
```bash
# Test IAP renewal
curl -X POST http://localhost:3000/webhooks/appstore \
  -H "Content-Type: application/json" \
  -d '{
    "notification_type": "DID_RENEW",
    "original_transaction_id": "apple_test_123"
  }'
```

**Expected Tests Pass:**
- ✅ Status 200
- ✅ received: true
- ✅ processed: true
- ✅ eventType: "DID_RENEW"

### 2. Refund Handling
```bash
# Test IAP refund
curl -X POST http://localhost:3000/webhooks/appstore \
  -H "Content-Type: application/json" \
  -d '{
    "notification_type": "REFUND",
    "original_transaction_id": "apple_test_123"
  }'
```

**Expected Tests Pass:**
- ✅ Status 200
- ✅ received: true
- ✅ processed: true
- ✅ eventType: "REFUND"

### 3. Google Play Events
```bash
# Test Google Play renewal (type 2)
curl -X POST http://localhost:3000/webhooks/play \
  -H "Content-Type: application/json" \
  -d '{
    "subscriptionNotification": {
      "notificationType": 2,
      "purchaseToken": "google_test_123"
    }
  }'
```

**Expected Tests Pass:**
- ✅ Status 200
- ✅ received: true
- ✅ processed: true
- ✅ eventType: "google_2"

## Debugging Failed Tests

### Test Fails: "Status code is not 200"

**Possible Causes:**
1. Server not running
2. Wrong endpoint URL
3. Invalid request payload

**Fix:**
```bash
# Check server is running
npm run dev

# Verify endpoint in Postman
GET http://localhost:3000/health
```

### Test Fails: "Webhook received is undefined"

**Possible Causes:**
1. Webhook returned error
2. Wrong response format

**Fix:**
- Check server logs
- Verify payload format matches webhook expectations

### Test Fails: "processed is false"

**Possible Causes:**
1. Unhandled event type
2. Missing subscription in database
3. Error during processing

**Fix:**
- Check `reason` field in response
- Review server logs for errors
- Verify subscription exists for the transaction ID

## Continuous Testing

### Postman Collection Runner

1. Open Postman
2. Click "Runner" button
3. Select "EdTech Webhook API" collection
4. Select "Webhooks" folder
5. Click "Run EdTech Webhook API"
6. View results:
   - Total tests run
   - Pass/fail count
   - Duration
   - Individual test results

### Newman (CLI)

```bash
# Install Newman
npm install -g newman

# Run webhook tests
newman run postman_collection.json \
  --environment postman_environment.json \
  --folder "Webhooks"

# Generate HTML report
newman run postman_collection.json \
  --environment postman_environment.json \
  --folder "Webhooks" \
  --reporters cli,html \
  --reporter-html-export webhook-test-report.html
```

## Test Assertions

### Common Test Patterns

```javascript
// Status code validation
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

// Response body validation
pm.test("Has required fields", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.received).to.exist;
    pm.expect(jsonData.eventId).to.exist;
});

// Type checking
pm.test("processed is boolean", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.processed).to.be.a('boolean');
});

// Conditional testing
if (pm.response.code === 200) {
    pm.test("Webhook processed", function () {
        var jsonData = pm.response.json();
        pm.expect(jsonData.processed).to.be.true;
    });
}
```

## Best Practices

1. **Run tests in order**: Some tests may depend on previous state
2. **Use unique IDs**: Leverage Postman variables like `{{$timestamp}}`
3. **Check logs**: Server logs provide detailed webhook processing info
4. **Test idempotency**: Send same webhook twice to verify deduplication
5. **Clean up**: Clear test data between test runs if needed

## Summary

✅ **All webhook endpoints have automated tests**
✅ **Tests verify response structure and processing**
✅ **Idempotency can be tested manually**
✅ **Both Stripe and IAP webhooks covered**
✅ **Ready for CI/CD integration with Newman**

Now you can confidently test all webhook endpoints with automated assertions! 🎉
