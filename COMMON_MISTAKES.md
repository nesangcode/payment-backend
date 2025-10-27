# Troubleshooting Guide

Comprehensive guide for fixing common issues when setting up and testing the EdTech Webhook API.

## 🚫 Mistake #1: Using One-Time Price Instead of Recurring

### The Problem
```json
{
  "error": "The price specified is set to `type=one_time` but this field only accepts prices with `type=recurring`."
}
```

You created a **one-time payment** price, but subscriptions need **recurring** prices!

### The Fix

**Option A: Add Recurring Price to Existing Product**
1. Stripe Dashboard → Products → Click your product
2. Click **+ Add another price**
3. Select **Recurring** → **Monthly**
4. Copy the new Price ID
5. Update Postman with the new Price ID

**Option B: Create New Product**
1. Create new product
2. When setting price, choose **Recurring** (not One-time)
3. Select billing period (Monthly/Yearly)
4. Copy Price ID

**Quick Check:** In Stripe, your price should show "Monthly" or "Yearly" not "One time"

---

## 🚫 Mistake #2: Using Product ID Instead of Price ID

### The Problem
```
stripe_plan_id = prod_ABC123xyz  ❌ WRONG!
```

**Error you'll see:**
```json
{
  "error": "No such price: 'prod_ABC123xyz'"
}
```

### The Fix
Use the **Price ID** (starts with `price_`), not Product ID:

```
stripe_plan_id = price_1234567890abcdef  ✅ CORRECT!
```

**Where to find it:**
1. Stripe Dashboard → Products
2. Click on your product
3. In the **Pricing** section, look for **API ID** column
4. Copy the ID that starts with `price_`

---

## 🚫 Mistake #2: Wrong User UID in Postman

### The Problem
```json
{
  "error": "Cannot create subscription for another user"
}
```

### The Fix
Your `user_id` in Postman must match your Firebase token's UID:

1. Run: `node checkTokenUid.js`
2. Copy the UID it shows
3. Update Postman: `user_id = <your real UID>`

---

## 🚫 Mistake #3: No Admin Role (403 Forbidden)

### The Problem
```json
{
  "error": "Forbidden",
  "message": "Admin access required"
}
```

### The Fix

**Step 1: Set Admin Role**
```bash
# Edit setAdminRole.js - replace YOUR_USER_UID_HERE with your actual UID
node setAdminRole.js
```

**Step 2: Get Fresh Token**
```bash
# Edit getNewToken.js - add your email/password
node getNewToken.js
```

**Step 3: Update Postman**
- Copy the new `idToken` from terminal
- Update `auth_token` in Postman environment

⚠️ **Important:** Old tokens won't have the admin role - you MUST get a new token!

---

## 🚫 Mistake #4: Expired Token (401 Unauthorized)

### The Problem
```json
{
  "error": "Unauthorized",
  "message": "Token expired"
}
```

Tokens expire after 1 hour.

### The Fix
Get a fresh token:
```bash
node getNewToken.js
# Copy new token to Postman auth_token
```

---

## 🚫 Mistake #5: Missing Stripe Secret Key

### The Problem
```
Error: Stripe secret key not configured
```

### The Fix
Add to `.env` file:
```bash
STRIPE_SECRET_KEY=sk_test_51xxxxxxxxxxxxx
```

Get from: Stripe Dashboard → Developers → API keys

Restart server: `npm run dev`

---

## 🚫 Mistake #6: Using Test User UID Placeholder

### The Problem
Postman has default: `user_id = test_user_123`

But this isn't your real Firebase user!

### The Fix
1. Check your token: `node checkTokenUid.js`
2. Update Postman with your real UID
3. Re-run tests

---

## 🚫 Mistake #7: Wrong Stripe Mode (Test vs Live)

### The Problem
Using live keys in test mode or vice versa.

### The Fix
**For testing:**
- Use **Test Mode** (toggle in Stripe Dashboard)
- Use `sk_test_` keys (not `sk_live_`)
- Use test card: `4242 4242 4242 4242`

**For production:**
- Use **Live Mode**
- Use `sk_live_` keys
- Use real payment methods

---

## 🚫 Mistake #8: Empty subscriptionId or payoutId

### The Problem
```
GET /v1/stripe/subscriptions//cancel
404 Not Found
```

Notice the `//` - missing ID!

### The Fix
These tests depend on previous tests:

1. Run **Create Subscription** first → saves `subscriptionId`
2. Run **Prepare Payout** first → saves `payoutId`
3. Then run the tests that need these IDs

Or run the full collection in order.

---

## 🚫 Mistake #9: Firestore Not Configured

### The Problem
```
Error: Could not load the default credentials
```

### The Fix
1. Download `serviceAccountKey.json` from Firebase Console
2. Put it in project root
3. Add to `.env`:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
   ```
4. Restart server

---

## 🚫 Mistake #10: Missing Firestore Index

### The Problem
```
FAILED_PRECONDITION: The query requires an index. You can create it here: https://...
```

### The Fix
**This is NORMAL on first run!** Firestore needs indexes for complex queries.

**Quick Fix:**
1. Copy the URL from the error message
2. Open it in your browser
3. Click **Create Index** button
4. Wait 1-2 minutes for it to build
5. Re-run your test

**Why:** Queries that filter AND sort need composite indexes. Firebase provides a direct link to create them.

**Common Indexes Needed:**
- `subscriptions` collection: `uid` + `createdAt`
- `ledger` collection: `uid` + `timestamp`
- `invoices` collection: `uid` + `created`

---

## 🚫 Mistake #10: Wrong Base URL

### The Problem
```
Error: connect ECONNREFUSED
```

### The Fix
Make sure server is running:
```bash
npm run dev
```

Check Postman environment:
```
base_url = http://localhost:3000
```

Not `https://` and not a different port!

---

## ✅ Pre-Flight Checklist

Before running Postman tests, verify:

### Environment
- [ ] Server running: `npm run dev`
- [ ] `.env` file configured with all keys
- [ ] `serviceAccountKey.json` in project root

### Firebase
- [ ] User created in Firebase Authentication
- [ ] Admin role set: `node setAdminRole.js`
- [ ] Fresh token obtained: `node getNewToken.js` (< 1 hour old)
- [ ] `auth_token` updated in Postman
- [ ] `user_id` matches your real Firebase UID

### Stripe
- [ ] Stripe account created (Test Mode enabled)
- [ ] Product created with **recurring** price
- [ ] Price ID copied (starts with `price_`)
- [ ] `stripe_plan_id` updated in Postman
- [ ] `STRIPE_SECRET_KEY` in `.env`

---

## 🆘 Still Stuck?

1. Check server logs for detailed error messages
2. Review relevant guide:
   - Firebase issues → [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)
   - Stripe issues → [STRIPE_SETUP.md](./STRIPE_SETUP.md)
   - 403 errors → [FIX_403_ERRORS.md](./FIX_403_ERRORS.md)
3. Verify all environment variables are set correctly
