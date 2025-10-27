# Stripe Currency Guide

## ⚠️ Important: How Currency Works in Stripe

**The `currency` parameter in the API request does NOT change the subscription currency!**

### Why?

In Stripe, **currency is a property of the Price object**, not the subscription. Each Price ID is tied to a specific currency and cannot be changed.

## 🔍 The Issue

When you make this request:

```json
POST /v1/stripe/subscriptions
{
  "uid": "user_123",
  "planId": "price_usd_12345",  // This is a USD price
  "currency": "IDR"              // ❌ This is IGNORED!
}
```

**What happens:**
1. ✅ Returns `200 OK` (subscription created successfully)
2. ✅ Subscription appears in your Firestore
3. ❌ Subscription is created with **USD currency** (from the Price)
4. ❌ The `"currency": "IDR"` parameter is completely ignored
5. ✅ Subscription appears in Stripe Dashboard (but as USD!)

The server now logs a warning:
```
⚠️  Currency parameter provided but will be ignored. Currency is determined by the Price ID.
```

## ✅ Correct Approach: Create Multiple Prices

### Step 1: Create Prices in Stripe Dashboard

You need to create **separate Price IDs** for each currency:

1. Go to [Stripe Dashboard → Products](https://dashboard.stripe.com/products)
2. Select your product (e.g., "Premium Subscription")
3. Click **"Add another price"**

#### USD Price
- Amount: `9.99`
- Currency: `USD`
- Billing: `Recurring - Monthly`
- Price ID: `price_usd_xxx`

#### IDR Price
- Amount: `150000`
- Currency: `IDR` (Indonesian Rupiah)
- Billing: `Recurring - Monthly`
- Price ID: `price_idr_xxx`

#### EUR Price
- Amount: `8.99`
- Currency: `EUR`
- Billing: `Recurring - Monthly`
- Price ID: `price_eur_xxx`

### Step 2: Use the Correct Price ID

**For USD:**
```json
POST /v1/stripe/subscriptions
{
  "uid": "user_123",
  "planId": "price_usd_xxx"
}
```

**For IDR:**
```json
POST /v1/stripe/subscriptions
{
  "uid": "user_123",
  "planId": "price_idr_xxx"
}
```

**For EUR:**
```json
POST /v1/stripe/subscriptions
{
  "uid": "user_123",
  "planId": "price_eur_xxx"
}
```

## 🎯 Client-Side Implementation

Your frontend should:

1. **Detect user's country/currency**
2. **Map to the correct Price ID**
3. **Send the appropriate Price ID**

Example:

```javascript
// Frontend logic
const PRICE_IDS = {
  USD: 'price_usd_xxx',
  IDR: 'price_idr_xxx',
  EUR: 'price_eur_xxx',
};

// Detect user's currency (based on IP, user settings, etc.)
const userCurrency = detectUserCurrency(); // Returns 'IDR', 'USD', etc.

// Get the correct Price ID
const planId = PRICE_IDS[userCurrency] || PRICE_IDS.USD;

// Create subscription with correct Price ID
await fetch('/v1/stripe/subscriptions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    uid: currentUser.uid,
    planId: planId,  // This determines the currency!
  }),
});
```

## 🏗️ Alternative: Dynamic Price Selection

If you want the backend to handle currency selection, you can implement a price mapping:

```typescript
// Add to stripeAdapter.ts or a config file
const PRICE_MAPPING = {
  premium_monthly: {
    USD: 'price_usd_xxx',
    IDR: 'price_idr_xxx',
    EUR: 'price_eur_xxx',
  },
  premium_yearly: {
    USD: 'price_usd_yearly_xxx',
    IDR: 'price_idr_yearly_xxx',
    EUR: 'price_eur_yearly_xxx',
  },
};

// Then in your route:
router.post('/subscriptions', async (req, res) => {
  const { uid, planType, currency } = req.body; // e.g., planType: 'premium_monthly'
  
  // Get correct Price ID based on plan type and currency
  const planId = PRICE_MAPPING[planType]?.[currency] || PRICE_MAPPING[planType].USD;
  
  const session = await stripeAdapter.createSession({
    uid,
    planId,  // Now using the correct currency-specific Price ID
  });
  
  res.json({ success: true, ...session });
});
```

## 📋 Environment Variables Setup

Add your Price IDs to `.env`:

```bash
# Stripe Price IDs
STRIPE_PRICE_PREMIUM_USD=price_usd_xxx
STRIPE_PRICE_PREMIUM_IDR=price_idr_xxx
STRIPE_PRICE_PREMIUM_EUR=price_eur_xxx
```

Then access them in code:

```typescript
const PRICE_IDS = {
  USD: process.env.STRIPE_PRICE_PREMIUM_USD,
  IDR: process.env.STRIPE_PRICE_PREMIUM_IDR,
  EUR: process.env.STRIPE_PRICE_PREMIUM_EUR,
};
```

## 🧪 Testing

### Test USD Subscription
```bash
curl -X POST http://localhost:3000/v1/stripe/subscriptions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "user_123",
    "planId": "price_usd_xxx"
  }'
```

Check in Stripe Dashboard:
- Subscription should show as **USD**
- Invoice should be in **USD**

### Test IDR Subscription
```bash
curl -X POST http://localhost:3000/v1/stripe/subscriptions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "user_456",
    "planId": "price_idr_xxx"
  }'
```

Check in Stripe Dashboard:
- Subscription should show as **IDR**
- Invoice should be in **Rp (Indonesian Rupiah)**

## 🚫 Common Mistakes

### ❌ Mistake 1: Thinking currency parameter changes the currency
```json
{
  "planId": "price_usd_xxx",
  "currency": "IDR"  // This does NOTHING!
}
```

### ✅ Correct: Use the right Price ID
```json
{
  "planId": "price_idr_xxx"  // IDR Price ID = IDR currency
}
```

### ❌ Mistake 2: Using the same Price ID for all currencies
```javascript
// ❌ Wrong
const planId = "price_usd_xxx";  // Always USD!
createSubscription({ uid, planId, currency: userCurrency });
```

### ✅ Correct: Map currency to Price ID
```javascript
// ✅ Correct
const priceIds = { USD: "price_usd_xxx", IDR: "price_idr_xxx" };
const planId = priceIds[userCurrency];
createSubscription({ uid, planId });
```

## 📊 Summary

| What You Send | What Stripe Uses | Result |
|---------------|------------------|--------|
| `price_usd_xxx` + `currency: "IDR"` | USD (from Price) | ❌ USD subscription |
| `price_idr_xxx` + `currency: "USD"` | IDR (from Price) | ❌ IDR subscription |
| `price_idr_xxx` (no currency param) | IDR (from Price) | ✅ IDR subscription |
| `price_usd_xxx` (no currency param) | USD (from Price) | ✅ USD subscription |

## 🎯 Key Takeaways

1. **Currency is determined by the Price ID**, not a request parameter
2. Create separate Prices for each currency in Stripe Dashboard
3. Map user's currency to the correct Price ID on client or server
4. The `currency` parameter is optional and informational only
5. Always check Stripe Dashboard to verify the correct currency was used

## 🔗 Resources

- [Stripe Prices Documentation](https://stripe.com/docs/api/prices)
- [Stripe Multi-Currency Guide](https://stripe.com/docs/currencies)
- [Creating Products and Prices](https://stripe.com/docs/products-prices/overview)
