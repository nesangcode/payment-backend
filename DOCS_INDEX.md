# 📚 Documentation Index

Clean, organized documentation for the EdTech Webhook API.

## 🚀 Getting Started

### New Users Start Here
1. **[QUICKSTART.md](./QUICKSTART.md)** - Get running in 10 minutes
   - Installation
   - Basic configuration
   - First test run

2. **[README.md](./README.md)** - Project overview
   - Features
   - Tech stack
   - Quick start commands

## 🔧 Setup Guides

### Essential Setup
- **[FIREBASE_SETUP.md](./FIREBASE_SETUP.md)** - Firebase configuration
  - Project setup
  - Authentication
  - Firestore indexes
  - Service account

- **[STRIPE_SETUP.md](./STRIPE_SETUP.md)** - Stripe integration
  - Product creation
  - Price IDs (recurring vs one-time)
  - API keys
  - Webhook configuration

- **[POSTMAN_SETUP.md](./POSTMAN_SETUP.md)** - API testing
  - Collection import
  - Environment setup
  - Auth token generation
  - Running tests

## 📖 Reference Documentation

### Architecture & Design
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture
  - Component structure
  - Data flow
  - Design patterns
  - Technology decisions

### API Reference
- **[API_EXAMPLES.md](./API_EXAMPLES.md)** - cURL examples
  - All endpoints documented
  - Request/response examples
  - Error cases

### Configuration
- **[DEMO_GUIDE.md](./DEMO_GUIDE.md)** - Demo scenarios
  - User flows
  - Test scenarios
  - Integration examples

## 🐛 Troubleshooting

- **[COMMON_MISTAKES.md](./COMMON_MISTAKES.md)** - Solutions for common issues
  - Price ID vs Product ID
  - One-time vs recurring prices
  - Auth token expiration
  - 403 Forbidden errors
  - Missing Firestore indexes
  - Pre-flight checklist

## ✅ Success!

- **[SETUP_COMPLETE.md](./SETUP_COMPLETE.md)** - All tests passing guide
  - What's working
  - Next steps
  - Production deployment
  - Development tips

## 📁 Helper Scripts

Located in project root:

```
checkTokenUid.js     - Decode JWT token to see UID and role
getNewToken.js       - Get fresh Firebase auth token
setAdminRole.js      - Grant admin role to user
```

## 🧪 Testing Resources

```
postman_collection.json     - Complete API test suite
postman_environment.json    - Environment variables
firestore.indexes.json      - Firestore index definitions
```

## 📂 Project Structure

```
webhook-api/
├── src/
│   ├── adapters/          # Payment provider integrations
│   ├── jobs/              # Background jobs
│   ├── lib/               # Shared utilities
│   ├── routes/            # API endpoints
│   ├── services/          # Business logic
│   └── types/             # TypeScript definitions
├── *.md                   # Documentation (this index!)
├── package.json           # Dependencies
├── .env                   # Environment config
└── serviceAccountKey.json # Firebase credentials
```

## 🎯 Quick Links by Task

### "I want to..."

**...get started quickly**
→ [QUICKSTART.md](./QUICKSTART.md)

**...understand the architecture**
→ [ARCHITECTURE.md](./ARCHITECTURE.md)

**...set up Stripe**
→ [STRIPE_SETUP.md](./STRIPE_SETUP.md)

**...fix an error**
→ [COMMON_MISTAKES.md](./COMMON_MISTAKES.md)

**...see API examples**
→ [API_EXAMPLES.md](./API_EXAMPLES.md)

**...test with Postman**
→ [POSTMAN_SETUP.md](./POSTMAN_SETUP.md)

**...deploy to production**
→ [SETUP_COMPLETE.md](./SETUP_COMPLETE.md)

## 📝 Documentation Status

✅ **Clean and organized**
- Redundant files removed
- Information consolidated
- Clear structure
- Up to date with passing tests

Last updated: All Postman tests passing ✅
