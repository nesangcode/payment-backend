# Postman Setup - Quick Start Guide

## 🚨 Before Running Tests

### 1. Start the API Server

```bash
# Make sure you have all environment variables set in .env
npm run dev

# Or for production
npm start
```

Verify server is running:
```bash
curl http://localhost:3000/health
# Should return: {"status":"ok","healthy":true,...}
```

### 2. Get Firebase Authentication Token

⚠️ **FIRST TIME?** See [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) for complete Firebase setup including:
- Enabling Email/Password sign-in method
- Creating test users
- Getting your Web API Key
- Setting up service account

---

You need a valid Firebase Auth token to test authenticated endpoints.

#### Option A: Using REST API (Easiest)

Get an ID token directly by signing in:

```bash
# Get your Web API Key from Firebase Console → Project Settings → General
curl -X POST \
  'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=YOUR_WEB_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "test@example.com",
    "password": "test123456",
    "returnSecureToken": true
  }'

# Copy the "idToken" from response → Use as auth_token in Postman
```

**Don't have a Firebase user yet?** See [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) to create one.

#### Option B: Using Firebase Admin SDK

Generate a custom token (requires exchange for ID token):

```javascript
// generateToken.js
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const uid = 'YOUR_USER_UID';

admin.auth().createCustomToken(uid)
  .then((customToken) => {
    console.log('Custom token:', customToken);
  });
```

Run it:
```bash
node generateToken.js
```

**Note**: Custom tokens need to be exchanged for ID tokens to use with the API:
```javascript
// In your client or use Firebase Auth REST API
firebase.auth().signInWithCustomToken(customToken)
  .then(user => user.getIdToken())
  .then(idToken => console.log('ID Token:', idToken));
```

For testing, you can use Option C (mock auth) to skip this token exchange.

#### Option C: Use Test Token (Development Only)

For testing, you can temporarily disable auth:

```typescript
// In src/lib/auth.ts - FOR TESTING ONLY
export async function authenticateUser(req: AuthRequest, res: Response, next: NextFunction) {
  // TEMPORARY: Mock authentication for testing
  req.user = {
    uid: 'test_user_123',
    email: 'test@example.com',
    role: 'admin', // or 'student'
  };
  next();
  return;
  
  // ... rest of auth code
}
```

**⚠️ WARNING**: Remove this before deploying to production!

### 3. Configure Postman Environment

1. Open Postman
2. Click **Environments** (left sidebar)
3. Select "EdTech Webhook API - Environment"
4. Update these variables:

| Variable | Value | Notes |
|----------|-------|-------|
| `auth_token` | `YOUR_FIREBASE_TOKEN` | From step 2 |
| `base_url` | `http://localhost:3000` | Default |
| `user_id` | `sbdeUM16tgZtyz2MUQQv1MxeDxb2` | Your real Firebase UID (from checkTokenUid.js) |
| `stripe_plan_id` | `price_xxx` | See [STRIPE_SETUP.md](./STRIPE_SETUP.md) - Create product first! |

5. Click **Save**

### 4. Configure Stripe (For Stripe Tests)

⚠️ **REQUIRED FOR STRIPE TESTS** - See [STRIPE_SETUP.md](./STRIPE_SETUP.md) for complete guide:

**Quick Steps:**
1. Create Stripe account → Use Test Mode
2. Go to **Products** → **Add product**
   - Name: "Premium Plan"
   - Price: $9.99/month
   - Click Save
3. **Copy the Price ID** (starts with `price_`)
4. Update Postman: `stripe_plan_id = price_xxx`

**Get API Keys:**

```bash
# In .env file
STRIPE_SECRET_KEY=sk_test_xxxxx  # From Developers → API keys
STRIPE_WEBHOOK_SECRET=whsec_xxx  # From stripe listen command
```

See [STRIPE_SETUP.md](./STRIPE_SETUP.md) for detailed instructions with screenshots-style guidance.

#### Getting Webhook Signature for Postman

The `stripe_webhook_signature` in Postman environment is **ONLY for webhook tests**. You have 3 options:

**Option 1: Use Stripe CLI (Recommended)**

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe  # macOS
# Or download from https://stripe.com/docs/stripe-cli

# Login to Stripe
stripe login

# Start webhook forwarding - THIS GENERATES SIGNATURES
stripe listen --forward-to localhost:3000/webhooks/stripe

# In another terminal, trigger test events
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.created
```

The Stripe CLI automatically includes valid signatures when forwarding webhooks.

**Option 2: For Manual Postman Tests (Mock Signature)**

For manual webhook testing in Postman, the signature validation is currently mocked in development. Set any value:

```bash
# In Postman environment
stripe_webhook_signature = "test_signature_any_value"
```

**Note**: The webhook will validate the signature format but accept test signatures in development mode.

**Option 3: Disable Signature Verification (Testing Only)**

Temporarily disable webhook signature verification in `src/webhooks/stripe.webhook.ts`:

```typescript
// Around line 20-30
const signature = req.headers['stripe-signature'];

// TEMPORARY: Skip verification for Postman testing
// if (!signature) {
//   return res.status(400).json({ error: 'No signature' });
// }

// Comment out signature verification
// stripe.webhooks.constructEvent(req.rawBody, signature, webhookSecret);
```

⚠️ **Remember to re-enable for production!**

#### Summary for Webhook Signature

| Testing Method | Signature Value | Notes |
|---------------|-----------------|-------|
| **Stripe CLI** | Auto-generated | ✅ Recommended - Real signatures |
| **Postman Manual** | `"any_test_value"` | For quick testing |
| **Production** | Real from Stripe | Must validate properly |

**For your case**: Since you're testing in Postman, just set:
```
stripe_webhook_signature = "test_sig_for_postman"
```

The webhook endpoints will work, but for production you'll need real Stripe CLI signatures.

### 5. Run Your First Test

1. Open the collection
2. Click **Health & Monitoring** → **Health Check**
3. Click **Send**
4. Should see: ✅ Status code is 200, ✅ API is healthy

## 🎯 Testing Order

### For Best Results, Run in This Order:

1. **Health Check** - Verify API is up
2. **Get User Entitlements** - Test unauthenticated endpoint
3. **Create Subscription** (Stripe) - Saves `subscriptionId`
4. **Get Subscription by ID** - Uses saved ID
5. **Get User Subscriptions** - View all
6. **Cancel Subscription** - Cleanup

## 🔍 Troubleshooting

### All Tests Fail with 401

**Problem**: Authentication token not set or invalid

**Solution**:
1. Check `auth_token` is set in environment
2. Verify token format: Should be a long string (JWT)
3. Token may have expired - generate new one
4. Check server logs for specific auth errors

```bash
# Check logs
npm run dev
# Look for: "Token verification failed" or "Invalid token"
```

### Tests Fail with 404

**Problem**: Route not found

**Solution**:
1. Verify server is running: `curl http://localhost:3000/health`
2. Check the URL in failed request
3. Ensure you're using correct base_url: `http://localhost:3000`
4. Some endpoints need IDs from previous requests

### Stripe Tests Fail

**Problem**: Stripe configuration missing

**Solution**:
1. Set `STRIPE_SECRET_KEY` in `.env`
2. Use test mode key: `sk_test_...`
3. Set valid price ID: `price_xxx`
4. Check Stripe dashboard for price IDs

### Webhook Tests Fail with 400

**Problem**: Invalid webhook signature

**Solution**:
1. For testing, webhook signature validation is mocked
2. Set any value for `stripe_webhook_signature`
3. For real webhooks, use Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

### Tests Pass but No Data

**Problem**: Firestore not configured

**Solution**:
1. Create `serviceAccountKey.json` from Firebase Console
2. Set `GOOGLE_APPLICATION_CREDENTIALS` in `.env`
3. Check Firestore connection in server logs

## 📊 Expected Results

With proper setup, you should see:

- ✅ **Health Check**: 2/2 tests pass
- ✅ **Create Subscription**: 4/4 tests pass (saves ID)
- ✅ **Get Subscription**: 2/2 tests pass
- ✅ **IAP Tests**: All pass (with valid receipts)
- ✅ **Admin Tests**: 2/2 tests pass each

**Total**: 32+ tests should pass when fully configured

## 🔐 Security Notes

### For Production:

1. **Never commit** auth tokens to git
2. **Use environment variables** for all secrets
3. **Rotate tokens** regularly
4. **Enable webhook signatures** (don't mock)
5. **Use HTTPS** for all requests

### Postman Security:

1. Store sensitive values in **environment** (not collection)
2. Mark secrets as **secret type** in Postman
3. Don't share environments with real tokens
4. Use separate environments for dev/staging/prod

## 🎓 Next Steps

Once health check passes:

1. Review [POSTMAN_GUIDE.md](./POSTMAN_GUIDE.md) for detailed testing
2. Check [API_EXAMPLES.md](./API_EXAMPLES.md) for request formats
3. See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design

## 💡 Pro Tips

1. **Use Collection Runner** for full suite
2. **Save responses** as examples for documentation
3. **Export results** for CI/CD integration
4. **Set delays** (100ms) between requests for rate limiting
5. **Use pre-request scripts** for dynamic data

## 📞 Need Help?

Common issues and solutions:

| Error | Solution |
|-------|----------|
| `ECONNREFUSED` | Start the server: `npm run dev` |
| `401 Unauthorized` | Set valid `auth_token` in environment |
| `404 Not Found` | Check route path and base_url |
| `500 Internal Error` | Check server logs and Firestore connection |
| `Signature verification failed` | Use Stripe CLI or mock signature |

Still stuck? Check server logs with:
```bash
npm run dev
# Watch for error messages
```
