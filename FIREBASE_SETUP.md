# Firebase Setup Guide for Testing

## 🔥 Initial Firebase Setup

### Step 1: Enable Authentication Sign-In Method

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (or create a new one)
3. Click **Authentication** in the left sidebar
4. Click **Get Started** (if first time)
5. Go to **Sign-in method** tab

### Step 2: Enable Email/Password Authentication

For testing the API, enable **Email/Password** sign-in:

1. Click on **Email/Password** in the sign-in providers list
2. Toggle **Enable** to ON
3. **Email link (passwordless sign-in)**: Leave OFF (not needed for testing)
4. Click **Save**

**Why Email/Password?**
- ✅ Simplest for testing
- ✅ No external dependencies
- ✅ Easy to create test users
- ✅ Works with REST API

### Step 3: Create Test Users

Now create test users for Postman testing:

#### Create Regular User:

1. Go to **Users** tab in Authentication
2. Click **Add user**
3. Fill in:
   - **Email**: `test@example.com`
   - **Password**: `test123456` (min 6 characters)
   - **User UID**: Leave blank (auto-generated)
4. Click **Add user**
5. **Copy the UID** - you'll need this!

#### Create Admin User:

1. Click **Add user** again
2. Fill in:
   - **Email**: `admin@example.com`
   - **Password**: `admin123456`
3. Click **Add user**
4. **Copy the UID**

### Step 4: Set Admin Role (Custom Claims)

You need Firebase Admin SDK to set custom claims. Create a script:

```javascript
// setAdminRole.js
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Replace with your admin user's UID
const adminUid = 'YOUR_ADMIN_USER_UID';

admin.auth().setCustomUserClaims(adminUid, { role: 'admin' })
  .then(() => {
    console.log('✅ Admin role set successfully!');
    console.log('User must sign out and sign in again for role to take effect.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error setting admin role:', error);
    process.exit(1);
  });
```

Run it:
```bash
node setAdminRole.js
```

### Step 5: Get Service Account Key

You need this for Firebase Admin SDK:

1. Go to **Project Settings** (gear icon)
2. Click **Service accounts** tab
3. Click **Generate new private key**
4. Click **Generate key** (downloads JSON file)
5. Save as `serviceAccountKey.json` in your project root
6. **⚠️ NEVER commit this to git!** (already in `.gitignore`)

### Step 6: Get Web API Key

For REST API token generation:

1. Go to **Project Settings** (gear icon)
2. Under **General** tab
3. Scroll to **Your apps** or **Web API Key**
4. Copy the **Web API Key** (looks like: `AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`)

## 🎯 Quick Test: Get Auth Token

Now get an ID token for Postman testing:

### Method 1: Using REST API (Easiest)

```bash
# Replace YOUR_WEB_API_KEY with the key from Step 6
curl -X POST \
  'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=YOUR_WEB_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "test@example.com",
    "password": "test123456",
    "returnSecureToken": true
  }'
```

**Response:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjE5...",  // ← Use this in Postman!
  "email": "test@example.com",
  "refreshToken": "...",
  "expiresIn": "3600",
  "localId": "..."
}
```

**Copy the `idToken`** and set it as `auth_token` in Postman environment!

### Method 2: Generate Token Script

```javascript
// getToken.js
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const uid = 'YOUR_USER_UID'; // From Step 3

admin.auth().createCustomToken(uid, { role: 'admin' })
  .then(customToken => {
    console.log('Custom Token:', customToken);
    console.log('\nNow exchange this for an ID token:');
    console.log('Use Firebase Auth REST API or signInWithCustomToken in client');
  })
  .catch(error => {
    console.error('Error:', error);
  });
```

## 📝 Summary - What You Need for Postman

After Firebase setup, you'll have:

| Item | Where to Find | Use In |
|------|---------------|--------|
| **ID Token** | REST API or client | Postman `auth_token` variable |
| **User UID** | Firebase Console → Users | Postman `user_id` variable |
| **Web API Key** | Project Settings → General | REST API calls |
| **Service Account** | Project Settings → Service accounts | Backend API (`.env` file) |

## 🔧 Update Your .env File

```bash
# Firebase Configuration
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
FIREBASE_PROJECT_ID=your-project-id

# Get from Firebase Console → Project Settings
FIREBASE_WEB_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXX

# Stripe (if testing payments)
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Region (optional)
REGION=INDONESIA  # or THAILAND, USA
INDONESIA_PPN_RATE=0.11
```

## ✅ Verify Setup

Test your Firebase setup:

```bash
# 1. Test token generation
curl -X POST \
  'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"test123456","returnSecureToken":true}'

# Should return idToken

# 2. Start your API
npm run dev

# 3. Test with Postman using the idToken
# Set auth_token in Postman environment and run tests
```

## 🆘 Troubleshooting

### "EMAIL_NOT_FOUND" Error
- User doesn't exist in Firebase Auth
- Create user in Firebase Console → Authentication → Users

### "INVALID_PASSWORD" Error
- Wrong password
- Reset password in Firebase Console or use correct password

### "API key not valid" Error
- Wrong Web API Key
- Get correct key from Project Settings → General

### "Service account not found" Error
- Missing `serviceAccountKey.json`
- Download from Project Settings → Service accounts

### "Permission denied" Error
- User doesn't have required role (admin)
- Run `setAdminRole.js` to set custom claims

## 🔥 Firestore Indexes (Important!)

When you first run certain queries, Firestore will ask you to create indexes.

### Expected Errors on First Run:

```
FAILED_PRECONDITION: The query requires an index. You can create it here: https://...
```

**This is normal!** Just click the link in the error message.

### Creating Indexes:

**Option 1: Click the Link (Easiest)**
1. Copy the URL from the error message
2. Open it in your browser
3. Click **Create Index**
4. Wait 1-2 minutes for it to build
5. Re-run your test

**Option 2: Manual Creation**

Go to Firebase Console → Firestore → Indexes:

| Collection | Fields | Purpose |
|------------|--------|---------|
| `subscriptions` | `uid` (Asc), `createdAt` (Desc) | Get user subscriptions |
| `ledger` | `uid` (Asc), `timestamp` (Desc) | Get user ledger entries |
| `invoices` | `uid` (Asc), `created` (Desc) | Get user invoices |

These will be created automatically when you run the tests and click the provided links.

## 🚀 Ready for Postman!

Once you have the `idToken`:

1. Open Postman
2. Select "EdTech Webhook API - Environment"
3. Set `auth_token` = your `idToken`
4. Set `user_id` = your user's UID
5. Run tests! ✅
6. **If you get index errors**: Click the link in the error to create indexes

Token expires in 1 hour - generate a new one when needed.

---

**Next Steps:**
- See [POSTMAN_SETUP.md](./POSTMAN_SETUP.md) for Postman configuration
- See [POSTMAN_QUICK_FIX.md](./POSTMAN_QUICK_FIX.md) for common issues
