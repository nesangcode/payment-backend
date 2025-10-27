# Stripe Setup Guide

## 🎯 Quick Setup: Get Your Stripe Price ID

### Step 1: Create a Stripe Account (Test Mode)

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/register)
2. Sign up or log in
3. Make sure you're in **Test Mode** (toggle in top right - should show "Test Mode")

### Step 2: Create a Product

1. In Stripe Dashboard, click **Products** in left sidebar
2. Click **+ Add product**
3. Fill in:
   - **Name**: `Premium Group Plan` (or any name)
   - **Description**: `Premium subscription for group tutoring`
   - **Pricing Model**: **Standard pricing** (not Graduated/Volume)
   - **Price**: `9.99` (or any amount)
   - ⭐ **IMPORTANT**: Select **Recurring** (NOT One-time!)
   - **Billing period**: `Monthly` (Weekly/Monthly/Yearly/etc.)
   - **Currency**: `USD` (or your currency)
4. Click **Add product**

⚠️ **Critical:** The price MUST be **Recurring** for subscriptions. If you select "One-time", you'll get an error!

### Step 3: Get the Price ID

⚠️ **IMPORTANT: Don't confuse Product ID with Price ID!**

After creating the product, you'll see:
- **Product ID**: `prod_ABC123xyz` ❌ **Don't use this!**
- **Price ID** (in pricing table): `price_1234567890abcdef` ✅ **Use this!**

**Where to find the Price ID:**
1. Click on your product name
2. Scroll to the **Pricing** section
3. Look for **API ID** column (starts with `price_`)
4. Copy the Price ID

The format is always: `price_` followed by random characters

**Why both IDs?**
- **Product ID** = What you're selling (e.g., "Premium Plan")
- **Price ID** = How much it costs (e.g., "$9.99/month")
- One product can have multiple prices (different billing periods, currencies, etc.)

### Step 4: Update Postman Environment

```
stripe_plan_id = price_1234567890abcdef  (paste your PRICE ID, not Product ID!)
```

**Common Mistake:**
- ❌ `stripe_plan_id = prod_ABC123xyz` (Product ID - won't work!)
- ✅ `stripe_plan_id = price_1234567890abcdef` (Price ID - correct!)

**Verification:** The ID should start with `price_` not `prod_`

## 📋 Multiple Products (Optional)

Create different tiers for testing:

| Product Name | Price | Price ID | Use For |
|--------------|-------|----------|---------|
| Basic Plan | $4.99 | `price_xxx1` | Basic features |
| Premium Plan | $9.99 | `price_xxx2` | Premium features |
| Enterprise | $29.99 | `price_xxx3` | Full features |

## 🔑 Get Stripe API Keys

### Secret Key (For Backend)

1. Go to **Developers** → **API keys** in Stripe Dashboard
2. Copy **Secret key** (starts with `sk_test_...`)
3. Add to `.env` file:
   ```bash
   STRIPE_SECRET_KEY=sk_test_51xxxxx
   ```

### Webhook Secret (For Webhooks)

**Option 1: Using Stripe CLI (Recommended)**

```bash
# Install Stripe CLI
# Windows (using Scoop)
scoop install stripe

# Or download from https://stripe.com/docs/stripe-cli

# Login
stripe login

# Forward webhooks (this shows the webhook secret)
stripe listen --forward-to localhost:3000/webhooks/stripe

# Copy the webhook signing secret (whsec_...)
```

**Option 2: Manual Webhook Setup**

1. Go to **Developers** → **Webhooks** in Stripe Dashboard
2. Click **Add endpoint**
3. Enter URL: `http://localhost:3000/webhooks/stripe` (for testing)
4. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_`)

Add to `.env`:
```bash
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

## 📝 Complete .env Configuration

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_51xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Test Price IDs (from Products page)
STRIPE_PREMIUM_PLAN_ID=price_1234567890abcdef
```

## ✅ Verify Stripe Setup

Test that Stripe is working:

```bash
# Start your API
npm run dev

# Test creating a subscription (in another terminal)
curl -X POST http://localhost:3000/v1/stripe/subscriptions \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: test-123" \
  -d '{
    "uid": "YOUR_USER_UID",
    "planId": "price_1234567890abcdef",
    "currency": "USD"
  }'

# Should return subscription details with clientSecret
```

## 🧪 Test Different Scenarios

### Test Card Numbers (Stripe Test Mode)

| Card Number | Description |
|-------------|-------------|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 9995` | Declined - insufficient funds |
| `4000 0000 0000 0002` | Declined - card declined |
| `4000 0025 0000 3155` | Requires authentication (3D Secure) |

Use any:
- **Expiry**: Any future date (e.g., `12/34`)
- **CVC**: Any 3 digits (e.g., `123`)
- **ZIP**: Any 5 digits (e.g., `12345`)

## 📊 Monitoring in Stripe Dashboard

Once you run tests, check:
- **Payments** - See test payments
- **Subscriptions** - See created subscriptions
- **Logs** - See API requests
- **Events** - See webhook events

## 🔧 Troubleshooting

### "No such price: 'price_xxx'"

**Problem**: Invalid price ID

**Fix**:
1. Go to Stripe Dashboard → Products
2. Click on your product
3. Copy the correct Price ID (starts with `price_`)
4. Update Postman environment

### "type=one_time but this field only accepts type=recurring"

**Problem**: You created a one-time payment price instead of a recurring subscription price

**Fix**:
1. Go to Stripe Dashboard → Products → Your product
2. Click **+ Add another price**
3. Select **Recurring** (not One-time)
4. Set billing period (Monthly, Yearly, etc.)
5. Copy the NEW Price ID
6. Update Postman with the recurring price ID

**Why:** Subscriptions require recurring prices. One-time prices are for single purchases.

### "Invalid API Key"

**Problem**: Wrong or missing secret key

**Fix**:
1. Go to Developers → API keys
2. Copy the Secret key (starts with `sk_test_`)
3. Update `.env` file
4. Restart server: `npm run dev`

### "Webhook signature verification failed"

**Problem**: Wrong webhook secret

**Fix**:
- **Using Stripe CLI**: The secret changes each time you run `stripe listen`
- **Manual webhook**: Copy signing secret from webhook endpoint in dashboard
- **For testing**: You can temporarily disable signature verification (see code comments)

## 🎓 Understanding Stripe Objects

### Price vs Product

- **Product**: The item you're selling (e.g., "Premium Plan")
- **Price**: How much it costs (e.g., "$9.99/month")
- One product can have multiple prices (different intervals, currencies)

### Subscription Flow

1. Create subscription → Get `clientSecret`
2. Use `clientSecret` in frontend to collect payment
3. Stripe sends webhook when payment succeeds
4. Your API activates the subscription

## 🚀 Ready for Testing

Once you have:
- ✅ Product created in Stripe
- ✅ Price ID copied (`price_xxx`)
- ✅ Secret key in `.env`
- ✅ Price ID in Postman `stripe_plan_id`

You can run the Stripe tests in Postman! 🎉

---

**Quick Checklist:**
- [ ] Created product in Stripe Dashboard
- [ ] Copied price ID (starts with `price_`)
- [ ] Added secret key to `.env`
- [ ] Updated `stripe_plan_id` in Postman
- [ ] Restarted server
- [ ] Ready to test!
