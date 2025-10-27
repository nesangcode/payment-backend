# Tax Implementation Guide

## Overview

The API automatically applies **Indonesian PPN (Pajak Pertambahan Nilai)** tax of **11%** to all IDR subscriptions.

## How It Works

### Automatic Tax Application

When you create a subscription with an **IDR Price**:

1. ✅ System detects the Price currency is `IDR`
2. ✅ Automatically creates or retrieves Indonesian PPN tax rate (11%)
3. ✅ Applies tax to the subscription
4. ✅ Stripe calculates the total with tax
5. ✅ Returns breakdown: subtotal + tax = total

### Tax Configuration

Tax rate is configured in `.env`:

```bash
# Indonesian PPN (Value Added Tax)
INDONESIA_PPN_RATE=0.11  # 11%
```

## Creating IDR Subscriptions with Tax

### Request

```bash
POST /v1/stripe/subscriptions
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN

{
  "uid": "user_123",
  "planId": "price_idr_xxx"  # IDR Price ID
}
```

### Response (with Tax)

```json
{
  "success": true,
  "subscriptionId": "sub_abc123",
  "clientSecret": "pi_secret_xyz",
  "sessionId": "sub_abc123",
  "currency": "IDR",
  "subtotal": 150000,
  "tax": 16500,
  "total": 166500
}
```

**Breakdown:**
- **Subtotal**: Rp 150,000 (base price)
- **Tax (11%)**: Rp 16,500
- **Total**: Rp 166,500

## USD Subscriptions (No Tax)

### Request

```bash
POST /v1/stripe/subscriptions

{
  "uid": "user_123",
  "planId": "price_usd_xxx"  # USD Price ID
}
```

### Response (No Tax)

```json
{
  "success": true,
  "subscriptionId": "sub_def456",
  "clientSecret": "pi_secret_abc",
  "sessionId": "sub_def456",
  "currency": "USD",
  "subtotal": 9.99,
  "tax": 0,
  "total": 9.99
}
```

**Note:** No tax is applied for non-IDR currencies

## Stripe Dashboard

When tax is applied, you'll see it in:

### Subscription Details
- **Subtotal**: Base price amount
- **Tax**: PPN 11%
- **Total**: Subtotal + Tax

### Invoices
- **Line Items**: Shows base subscription price
- **Tax**: Indonesian PPN (11%)
- **Amount Due**: Total with tax

## Tax in Firestore

### Subscription Document

```javascript
{
  id: "sub_abc123",
  uid: "user_123",
  provider: "stripe",
  planId: "price_idr_xxx",
  currency: "IDR",
  status: "active",
  tax: 16500,  // Tax amount in rupiah
  metadata: {
    uid: "user_123",
    currency: "IDR",
    hasTax: true  // Indicates tax was applied
  },
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Invoice Document

```javascript
{
  id: "in_abc123",
  uid: "user_123",
  provider: "stripe",
  amount: 166500,  // Total with tax
  currency: "IDR",
  tax: 16500,  // Tax amount
  status: "paid",
  subscriptionId: "sub_abc123",
  lines: [
    {
      description: "Premium Subscription",
      amount: 150000,  // Base amount
      quantity: 1,
      planId: "price_idr_xxx"
    }
  ],
  createdAt: Timestamp
}
```

## Server Logs

### When Creating IDR Subscription

```json
{
  "msg": "Applying Indonesian PPN 11% tax to subscription",
  "taxRateId": "txr_abc123"
}

{
  "msg": "Stripe subscription created with tax",
  "uid": "user_123",
  "subscriptionId": "sub_abc123",
  "currency": "IDR",
  "subtotal": 150000,
  "tax": 16500,
  "total": 166500
}
```

### When Creating USD Subscription

```json
{
  "msg": "Stripe subscription created with tax",
  "uid": "user_456",
  "subscriptionId": "sub_def456",
  "currency": "USD",
  "subtotal": 9.99,
  "tax": 0,
  "total": 9.99
}
```

## Tax Rate Management

### First-Time Creation

When the first IDR subscription is created:

1. System checks if Indonesian PPN tax rate exists in Stripe
2. If not found, creates a new tax rate:
   ```javascript
   {
     display_name: "Indonesian PPN",
     description: "Indonesian Value Added Tax (PPN)",
     jurisdiction: "ID",
     percentage: 11.0,
     inclusive: false,  // Tax added on top
     active: true
   }
   ```
3. Caches the tax rate ID for future use

### Reusing Existing Tax Rate

For subsequent IDR subscriptions:

1. System retrieves the cached tax rate ID
2. Applies it to the new subscription
3. No duplicate tax rates are created

## Testing Tax

### Test IDR Subscription

```bash
curl -X POST http://localhost:3000/v1/stripe/subscriptions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "user_123",
    "planId": "price_idr_150000"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "currency": "IDR",
  "subtotal": 150000,
  "tax": 16500,
  "total": 166500
}
```

### Verify in Stripe

1. Go to [Stripe Dashboard → Subscriptions](https://dashboard.stripe.com/subscriptions)
2. Click the subscription
3. Check **Pricing** section:
   - Should show base price
   - Should show tax line: "Indonesian PPN (11%)"
   - Should show total with tax

### Verify in Firestore

```javascript
// Get subscription
const subDoc = await db.collection('subscriptions').doc('sub_abc123').get();
console.log(subDoc.data());

// Output:
{
  currency: "IDR",
  tax: 16500,
  metadata: {
    hasTax: true
  }
}
```

## Tax Assumptions (Documented)

As per requirements, the following assumptions are documented:

### 1. Tax Applicability
- **Assumption**: Indonesian PPN applies to **all** digital services sold to Indonesian customers
- **Rate**: 11% (as of current Indonesian tax law)
- **Application**: Tax is **exclusive** (added on top of the price)

### 2. Currency Detection
- **Assumption**: If subscription uses IDR currency, customer is in Indonesia
- **Logic**: `currency === 'IDR'` → Apply PPN tax
- **Rationale**: Simplifies tax determination without requiring customer location API

### 3. Tax Jurisdiction
- **Field**: `jurisdiction: "ID"` (Indonesia)
- **Assumption**: All IDR transactions are domestic Indonesian transactions
- **Stripe Setup**: Tax rate marked as Indonesian jurisdiction

### 4. Mock Stripe Tax
- **Approach**: Uses Stripe Tax Rates (not full Stripe Tax product)
- **Benefit**: Provides tax calculation without premium Stripe Tax subscription
- **Display**: Tax appears on invoices as "Indonesian PPN"

### 5. Tax Exemptions
- **Assumption**: No tax exemptions implemented
- **Future**: Could add customer tax IDs or exemption flags
- **Current**: All IDR subscriptions taxed uniformly

## Changing Tax Rate

### Update .env

```bash
# Change from 11% to new rate
INDONESIA_PPN_RATE=0.12  # 12%
```

### Restart Server

```bash
npm run dev
```

### Behavior

- **Existing subscriptions**: Keep old tax rate
- **New subscriptions**: Use new tax rate (12%)
- **New tax rate created**: Stripe creates a new tax rate object

## Multi-Country Tax Support

### Future Enhancement

To support tax in multiple countries:

```typescript
// Example: Extend to multiple countries
const TAX_RATES = {
  IDR: { percentage: 11, name: 'Indonesian PPN', jurisdiction: 'ID' },
  EUR: { percentage: 19, name: 'EU VAT', jurisdiction: 'EU' },
  GBP: { percentage: 20, name: 'UK VAT', jurisdiction: 'GB' },
};

async getTaxRateForCurrency(currency: string) {
  const taxConfig = TAX_RATES[currency];
  if (!taxConfig) return null;
  
  // Get or create tax rate for this country
  return await this.getOrCreateTaxRate(taxConfig);
}
```

## Troubleshooting

### Tax Not Applied

**Problem:** IDR subscription created but no tax shown

**Solutions:**
1. Check Price currency:
   ```bash
   stripe prices retrieve price_xxx
   # Should show: currency: "idr"
   ```

2. Check environment variable:
   ```bash
   echo $INDONESIA_PPN_RATE
   # Should output: 0.11
   ```

3. Check server logs for tax application message

### Wrong Tax Amount

**Problem:** Tax calculated incorrectly

**Check:**
1. PPN rate in `.env`: `INDONESIA_PPN_RATE=0.11`
2. Server logs show correct percentage
3. Stripe Dashboard shows correct tax rate percentage

### Tax Rate Duplicates

**Problem:** Multiple "Indonesian PPN" tax rates in Stripe

**Solution:**
- Tax rate caching prevents duplicates
- If duplicates exist, system will use the first active one
- Manually archive old tax rates in Stripe Dashboard

## Summary

✅ **Automatic**: Tax applied automatically for IDR subscriptions  
✅ **Configurable**: Tax rate defined in `.env`  
✅ **Transparent**: Client receives tax breakdown in response  
✅ **Cached**: Tax rate reused to avoid duplicates  
✅ **Logged**: Tax application logged for debugging  
✅ **Stored**: Tax amount saved in Firestore  
✅ **Documented**: Assumptions clearly stated  

🎯 **Result**: For IDR subscriptions, customers pay **base price + 11% PPN tax**
