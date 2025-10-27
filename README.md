# Payments Service - Webhook-Driven Architecture

A production-minded payments service that uses **webhooks as the single source of truth**, supporting multiple payment providers (Stripe, IAP, Wise, TazaPay) with a clean adapter pattern.

## 🎯 Features

- **Provider Adapter Layer**: Unified interface for Stripe, IAP (App Store/Google Play), Wise, and TazaPay
- **Webhook-Driven**: All state changes driven by webhook events (idempotent, verified)
- **Subscription Management**: Full lifecycle handling with grace periods, dunning, and proration
- **Entitlements System**: Feature toggles based on subscription status
- **Ledger**: Append-only transaction log for audit and reconciliation
- **Background Jobs**: Automated dunning and daily reconciliation
- **Production-Ready**: Structured logging, error handling, type safety

## 🏗️ Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Stripe    │────────▶│   Webhooks   │────────▶│  Firestore  │
│ (1-to-1)    │         │  (verified)  │         │  (ledger)   │
└─────────────┘         └──────────────┘         └─────────────┘
                               │
┌─────────────┐                │                 ┌─────────────┐
│ IAP (Apple/ │────────────────┤                 │ Entitlements│
│  Google)    │                │                 │   Service   │
│ (groups)    │                │                 └─────────────┘
└─────────────┘                │
                               │                 ┌─────────────┐
┌─────────────┐                │                 │ Subscription│
│   Wise      │────────────────┤                 │   Manager   │
│ (payouts)   │                │                 └─────────────┘
└─────────────┘                │
                               │                 ┌─────────────┐
┌─────────────┐                │                 │   Dunning   │
│  TazaPay    │────────────────┘                 │     Job     │
│   (stub)    │                                  └─────────────┘
└─────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Firebase project with Firestore
- Stripe account (test mode)
- Google Cloud account (for IAP)

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### Setting Up Credentials

#### 1. Firebase (Required)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing one
3. Go to **Project Settings** → **Service Accounts**
4. Click **Generate New Private Key**
5. Save the JSON file as `serviceAccountKey.json` in project root
6. Copy your Project ID

Update `.env`:
```bash
FIREBASE_PROJECT_ID=your-project-id-here
FIREBASE_CREDENTIALS_PATH=./serviceAccountKey.json
```

7. Enable Firestore Database: **Build** → **Firestore Database** → **Create Database**

#### 2. Stripe (Required for Card Payments)

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/register)
2. Create account or login
3. Toggle **Test mode** (top right)
4. Go to **Developers** → **API keys**
5. Copy **Secret key** (starts with `sk_test_`)

Update `.env`:
```bash
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
```

**For Local Development - Use Stripe CLI:**

Webhooks require a publicly accessible URL. For local testing, use the Stripe CLI:

```bash
# Install Stripe CLI
# macOS
brew install stripe/stripe-cli/stripe

# Windows (with Scoop)
scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
scoop install stripe

# Or download from: https://github.com/stripe/stripe-cli/releases

# Login to your Stripe account
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/webhooks/stripe

# This will output a webhook signing secret (starts with whsec_)
# Copy it to your .env file
```

The CLI will display:
```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx (^C to quit)
```

Copy this secret to `.env`:
```bash
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

**For Production - Add Webhook Endpoint:**

When deploying to production with a public URL:

1. Go to **Developers** → **Webhooks** → **Add endpoint**
2. Enter your URL: `https://yourdomain.com/webhooks/stripe`
3. Select events: `invoice.*`, `customer.subscription.*`, `charge.refunded`
4. Copy the **Signing secret** to your production `.env`

#### 3. Apple IAP (Optional - for iOS In-App Purchases)

1. Go to [App Store Connect](https://appstoreconnect.apple.com/)
2. Select your app → **App Information** → **App-Specific Shared Secret**
3. Click **Generate** if not exists
4. Copy the shared secret

Update `.env`:
```bash
IAP_APPLE_SHARED_SECRET=your_apple_shared_secret_here
```

**Note**: Full implementation requires App Store Server API. Current version uses mock validation.

#### 4. Google Play IAP (Optional - for Android In-App Purchases)

1. Go to [Google Play Console](https://play.google.com/console/)
2. Select your app → **Monetization setup** → **Licensing**
3. Download service account JSON
4. Save as `google-play-service-account.json` in project root

Update `.env`:
```bash
IAP_GOOGLE_SERVICE_ACCOUNT_PATH=./google-play-service-account.json
```

**Note**: Current version uses mock validation for demo purposes.

#### 5. Wise (Optional - for Payouts)

For production, you'll need:
1. [Wise Business Account](https://wise.com/business)
2. API token from Settings → API tokens
3. Profile ID from account

Update `.env`:
```bash
WISE_API_KEY=your_wise_api_key_here
WISE_PROFILE_ID=your_profile_id_here
WISE_WEBHOOK_SECRET=your_webhook_secret_here
```

**Note**: Current version uses mock implementation.

### Quick Start (Minimum Setup)

For development/testing, **only Firebase and Stripe are required**:

```bash
# After setting up Firebase and Stripe credentials above:

# Build the project
npm run build

# Start development server
npm run dev

# Server will start on http://localhost:3000
```

Test it's working:
```bash
curl http://localhost:3000/health
# Should return: {"status":"healthy","timestamp":"...","uptime":...}
```

### Running in Development

```bash
# Start the API server
npm run dev

# Run tests
npm test

# Run specific test suites
npm test -- webhook_idempotency
npm test -- subscription_state_machine

# Run with coverage
npm run test:coverage

# Run background jobs manually
npm run job:dunning
npm run job:reconcile
```

## 📁 Project Structure

```
src/
├── adapters/           # Provider adapters (Stripe, IAP, Wise, TazaPay)
│   ├── stripeAdapter.ts
│   ├── iapAdapter.ts
│   ├── wiseAdapter.ts
│   └── tazapayAdapter.ts
├── services/           # Business logic services
│   ├── subscriptionManager.ts
│   ├── entitlementService.ts
│   └── invoiceService.ts
├── routes/             # API endpoints
│   ├── stripe.routes.ts
│   ├── iap.routes.ts
│   ├── wise.routes.ts
│   └── admin.routes.ts
├── webhooks/           # Webhook handlers
│   ├── stripe.webhook.ts
│   ├── appstore.webhook.ts
│   ├── play.webhook.ts
│   └── wise.webhook.ts
├── jobs/               # Background jobs
│   ├── dunning.ts
│   └── reconcile.ts
├── lib/                # Core utilities
│   ├── firestore.ts
│   ├── logger.ts
│   ├── auth.ts
│   └── idempotency.ts
├── types/              # TypeScript type definitions
│   └── index.ts
└── test/               # Test suites
    ├── webhook_idempotency.test.ts
    ├── subscription_state_machine.test.ts
    └── iap_validation.test.ts
```

## 📡 API Endpoints

### Stripe Routes (1-to-1 Sessions)

```http
POST /v1/stripe/subscriptions
Authorization: Bearer <firebase_token>
Content-Type: application/json

{
  "uid": "user_123",
  "planId": "price_xxx",
  "currency": "USD"
}

Response: {
  "subscriptionId": "sub_xxx",
  "clientSecret": "pi_xxx_secret_xxx"
}
```

```http
POST /v1/stripe/change-payment-method
Authorization: Bearer <firebase_token>

{
  "uid": "user_123"
}

Response: {
  "clientSecret": "seti_xxx_secret_xxx"
}
```

### IAP Routes (Groups/Recordings)

```http
POST /v1/iap/validate
Authorization: Bearer <firebase_token>

{
  "uid": "user_123",
  "platform": "ios",
  "receipt": "base64_encoded_receipt"
}

Response: {
  "valid": true,
  "transactionId": "txn_xxx",
  "productId": "com.edtech.group.premium",
  "expiresDate": "2024-12-31T23:59:59Z"
}
```

### Wise Routes (Tutor Payouts)

```http
POST /v1/payouts/prepare
Authorization: Bearer <firebase_token> (admin only)

{
  "tutorId": "tutor_123",
  "amount": 500,
  "currency": "USD"
}

Response: {
  "payoutId": "payout_xxx",
  "status": "queued"
}
```

```http
POST /v1/payouts/approve
Authorization: Bearer <firebase_token> (admin only)

{
  "payoutId": "payout_xxx"
}

Response: {
  "payoutId": "payout_xxx",
  "status": "processing"
}
```

### Admin Routes

```http
GET /v1/subscriptions/:id
GET /v1/invoices/:id
GET /v1/ledger?uid=user_123&limit=50
GET /v1/entitlements/:uid
GET /v1/users/:uid/subscriptions
GET /v1/users/:uid/invoices
POST /v1/subscriptions/:id/cancel
```

### Webhooks

```http
POST /webhooks/stripe
Stripe-Signature: <signature>

POST /webhooks/appstore
POST /webhooks/play
POST /webhooks/wise
X-Signature: <signature>
```

## 🔄 Subscription State Machine

```
incomplete ──▶ active ──▶ past_due ──▶ canceled
    │            │           │
    │            ▼           │
    │        trialing        │
    │            │           │
    └────────────┴───────────┘
                 │
                 ▼
              ended
```

### State Transitions

- **incomplete → active**: First payment succeeds (webhook)
- **active → past_due**: Payment fails, grace period starts (T+0)
- **past_due → active**: Payment retried successfully
- **past_due → canceled**: Grace period expires (T+7)
- **active → canceled**: User cancels or admin cancels

### Grace Period

- Default: 7 days (configurable via `GRACE_DAYS`)
- Entitlements remain active during grace
- Dunning attempts at T+0, T+3, T+7
- Auto-cancel if unresolved after grace

## 🔐 Authentication

All API routes (except webhooks) require Firebase Authentication:

```javascript
// Client-side example
const idToken = await firebase.auth().currentUser.getIdToken();

fetch('https://api.example.com/v1/subscriptions/sub_123', {
  headers: {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json'
  }
});
```

## 🎫 Entitlements

Entitlements are managed automatically based on subscription provider:

- **Stripe** → `oneToOne: true, groupReplay: false`
- **IAP** → `groupReplay: true, oneToOne: false`
- **Android IAP** → Additional `androidNoReplay: true` flag

Check entitlements in your app:

```javascript
const response = await fetch(`/v1/entitlements/${uid}`);
const { entitlements } = await response.json();

if (entitlements.features.oneToOne) {
  // Show 1-to-1 booking UI
}

if (entitlements.features.groupReplay && !entitlements.features.androidNoReplay) {
  // Show replay access
}
```

## 📊 Data Model (Firestore)

### Collections

- `users/{uid}` - User profiles
- `billing/customers/{uid}` - Billing customer records
- `subscriptions/{subId}` - Subscription states
- `entitlements/{uid}` - Feature flags
- `invoices/{invoiceId}` - Invoice records
- `payments/{paymentId}` - Payment transactions
- `payouts/{payoutId}` - Tutor payout records
- `ledger/{entryId}` - Append-only transaction log (immutable)
- `webhooks/{eventId}` - Webhook deduplication

### Ledger Events

All money-related events are logged:

- `invoice.created`
- `payment.succeeded`
- `payment.failed`
- `subscription.renewed`
- `subscription.created`
- `subscription.canceled`
- `payout.paid`
- `refund.succeeded`

Query ledger for user:

```javascript
GET /v1/ledger?uid=user_123&limit=50
```

## 🔁 Dunning Flow

Automated retry logic for failed payments:

1. **T+0**: First failure → Set `past_due`, start grace period
   - Send email reminder
   - Generate retry payment link
   
2. **T+3**: Still failed → Second reminder
   - Escalate notification urgency
   
3. **T+7**: Grace period expires → Cancel subscription
   - Revoke entitlements
   - Final notification

Run manually:

```bash
npm run job:dunning
```

Schedule with cron (production):

```bash
# Daily at 9 AM
0 9 * * * cd /path/to/app && npm run job:dunning
```

## 🧮 Reconciliation

Daily job to verify ledger vs provider records:

```bash
npm run job:reconcile
```

Compares:
- Total amounts in ledger
- Total amounts from provider APIs (Stripe, etc.)
- Writes mismatch alerts to ledger

## 🧪 Testing

### Unit Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Test Suites

1. **webhook_idempotency.test.ts**: Ensures duplicate webhooks don't cause issues
2. **subscription_state_machine.test.ts**: Validates state transitions
3. **iap_validation.test.ts**: Tests IAP receipt validation and refunds

### Manual Testing

#### Postman Collection

Import the full Postman collection for interactive API testing:

```bash
# Files included:
- postman_collection.json    # Complete API test collection
- postman_environment.json   # Environment variables
- POSTMAN_GUIDE.md          # Detailed testing guide
```

**Quick Start:**
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Add your Firebase serviceAccountKey.json to project root

# 3. Start server
npm run dev

# 4. Test with Postman
# Import postman_collection.json and postman_environment.json
```

**First Time Setup?** See [QUICKSTART.md](./QUICKSTART.md) for detailed walkthrough.

## 📖 Documentation

**📚 [DOCS_INDEX.md](./DOCS_INDEX.md)** - Complete documentation index

### Quick Links
- 🚀 [QUICKSTART.md](./QUICKSTART.md) - **Start here!** Get running in 10 minutes
- 🔥 [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) - Firebase configuration
- 💳 [STRIPE_SETUP.md](./STRIPE_SETUP.md) - Stripe integration
- 🧪 [POSTMAN_SETUP.md](./POSTMAN_SETUP.md) - API testing
- 🐛 [COMMON_MISTAKES.md](./COMMON_MISTAKES.md) - Troubleshooting
- ✅ [SETUP_COMPLETE.md](./SETUP_COMPLETE.md) - All tests passing? Read this!

### Webhook Testing

For real webhook testing, use the Stripe CLI:

```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe listen --forward-to localhost:3000/webhooks/stripe

# Trigger test events
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.created
```

## ✅ All Tests Passing?

See **[SETUP_COMPLETE.md](./SETUP_COMPLETE.md)** for next steps and production deployment guide.

## 💰 Tax Handling

- Indonesian PPN (11%) applied automatically for `currency=IDR`
- Configurable via `INDONESIA_PPN_RATE` environment variable
- Tax amount stored separately in invoices
- Extendable for other regions

## 🔧 Configuration

### Environment Variables

See `.env.example` for all options:

- `FIREBASE_PROJECT_ID`: Your Firebase project
- `STRIPE_SECRET_KEY`: Stripe API key
- `STRIPE_WEBHOOK_SECRET`: Webhook signing secret
- `IAP_APPLE_SHARED_SECRET`: Apple shared secret
- `WISE_API_KEY`: Wise API key (mock)
- `GRACE_DAYS`: Grace period duration (default: 7)
- `DUNNING_SCHEDULE`: Cron expression for dunning job
- `RECONCILE_SCHEDULE`: Cron expression for reconciliation

### Provider Setup

#### Stripe

1. Create account at https://dashboard.stripe.com
2. Get API keys from Developers → API keys
3. Set up webhook endpoint → Developers → Webhooks
4. Add endpoint URL: `https://yourdomain.com/webhooks/stripe`
5. Select events: `invoice.*`, `customer.subscription.*`, `charge.refunded`
6. Copy webhook signing secret to `.env`

#### Apple IAP

1. Get shared secret from App Store Connect
2. Enable server notifications in App Store Connect
3. Set notification URL: `https://yourdomain.com/webhooks/appstore`

#### Google Play

1. Enable Real-time Developer Notifications
2. Set up Cloud Pub/Sub topic
3. Configure notification endpoint: `https://yourdomain.com/webhooks/play`

#### Wise

1. Create Wise business account
2. Get API token from Settings → API
3. Set webhook URL: `https://yourdomain.com/webhooks/wise`

## 🚢 Deployment

### Cloud Run (Recommended)

```bash
# Build container
gcloud builds submit --tag gcr.io/PROJECT_ID/payments-service

# Deploy
gcloud run deploy payments-service \
  --image gcr.io/PROJECT_ID/payments-service \
  --platform managed \
  --region asia-southeast2 \
  --allow-unauthenticated \
  --set-env-vars-file .env.yaml
```

### Traditional Server

```bash
# Build
npm run build

# Start with PM2
pm2 start dist/index.js --name payments-service

# Set up cron jobs
crontab -e
# Add:
0 9 * * * cd /path/to/app && npm run job:dunning
0 2 * * * cd /path/to/app && npm run job:reconcile
```

## 📝 Assumptions & Limitations

### Mock/Stub Implementations

- **IAP Receipt Validation**: Mock implementation (use real APIs in production)
- **Wise Payouts**: Mock API calls (integrate real Wise API)
- **TazaPay**: Stub only, not implemented
- **Tax Calculation**: Simple percentage-based (use Stripe Tax in production)

### Production Recommendations

1. Use Stripe Tax API for accurate tax calculation
2. Implement real Apple/Google receipt validation
3. Set up proper monitoring (Sentry, DataDog)
4. Add rate limiting on API endpoints
5. Implement proper webhook retry logic
6. Add database backups and disaster recovery
7. Set up staging environment for testing
8. Implement webhook event replay capability

## 🐛 Troubleshooting

### Webhooks Not Received

- Check firewall allows incoming connections
- Verify webhook URL is correct in provider dashboard
- Check webhook signature verification is not failing
- Review logs: `tail -f logs/app.log | grep webhook`

### Subscription Stuck in past_due

- Check grace period hasn't expired
- Verify dunning job is running
- Review ledger entries for the subscription
- Check if payment method needs updating

### Entitlements Not Updating

- Verify webhook was processed successfully
- Check subscription status is `active`
- Review entitlements collection in Firestore
- Ensure no other active subscriptions interfering

## 📞 Support

For questions or issues:

- Check logs in `/logs` directory
- Review Firestore data for debugging
- Check webhook delivery logs in provider dashboards
- Contact: studyosystemio@gmail.com

## 📄 License

MIT License - See LICENSE file for details

---

**Built with ❤️ for robust, production-ready payment processing**
