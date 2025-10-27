# 🚀 Quick Start Guide

Get the EdTech Webhook API running in 10 minutes.

## Prerequisites

- Node.js 16+ installed
- Firebase project created
- Stripe account (optional for Stripe tests)

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Environment

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Add your Firebase service account key:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Project Settings → Service Accounts → Generate New Private Key
   - Save as `serviceAccountKey.json` in project root

3. Update `.env` with your Firebase config:
   ```bash
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_API_KEY=your-api-key
   ```

## Step 3: Start the Server

```bash
npm run dev
```

Server will start on `http://localhost:3000`

## Step 4: Test with Postman

1. **Import Collection & Environment**
   - Import `postman_collection.json`
   - Import `postman_environment.json`

2. **Create Firebase User**
   ```bash
   # Use Firebase Console or create via API
   # Go to Authentication → Users → Add User
   ```

3. **Set Admin Role**
   ```bash
   # Edit setAdminRole.js - add your user UID
   node setAdminRole.js
   ```

4. **Get Auth Token**
   ```bash
   # Edit getNewToken.js - add your credentials
   node getNewToken.js
   ```

5. **Update Postman Environment**
   - `auth_token` = token from step 4
   - `user_id` = your Firebase UID
   - `base_url` = `http://localhost:3000`

6. **Run Tests!**
   - Run the collection or individual requests
   - All tests should pass ✅

## Step 5: Configure Stripe (Optional)

Only needed for Stripe payment tests:

1. Create Stripe account at [stripe.com](https://stripe.com)
2. Use **Test Mode**
3. Create a product with **recurring** price
4. Copy the Price ID (starts with `price_`)
5. Add to `.env`:
   ```bash
   STRIPE_SECRET_KEY=sk_test_...
   ```
6. Update Postman: `stripe_plan_id = price_xxx`

See [STRIPE_SETUP.md](./STRIPE_SETUP.md) for details.

## ✅ Verification

Test the API is working:

```bash
curl http://localhost:3000/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "..."
}
```

## 📚 Next Steps

- **API Testing**: See [POSTMAN_GUIDE.md](./POSTMAN_GUIDE.md)
- **Architecture**: See [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Troubleshooting**: See [COMMON_MISTAKES.md](./COMMON_MISTAKES.md)

## 🆘 Need Help?

**Common Issues:**
- 401 Unauthorized → Check auth token (expires in 1 hour)
- 403 Forbidden → Set admin role and get new token
- 404 Not Found → Check server is running
- 500 Internal Error → Check server logs

See [COMMON_MISTAKES.md](./COMMON_MISTAKES.md) for detailed troubleshooting.

---

**🎉 All Set!** You're ready to test the EdTech Webhook API!
