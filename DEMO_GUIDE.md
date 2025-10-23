# Demo Video Guide (≤2 minutes)

This guide outlines what to show in your demo video submission.

## 🎬 Video Structure (120 seconds)

### Introduction (10 seconds)
- "Hi, I'm [Name]. This is my webhook-driven payments service."
- Show terminal/IDE with project structure

### Architecture Overview (20 seconds)
- "The system uses webhooks as the single source of truth"
- Quick diagram or show adapters folder
- "Provider adapters for Stripe, IAP, Wise, and TazaPay"
- Show `src/adapters/` and `src/webhooks/` folders

### Happy Path Demo (40 seconds)

**Stripe Subscription**
```bash
# Show terminal
npm run dev

# In another terminal/Postman
# 1. Create subscription
POST /v1/stripe/subscriptions
{
  "uid": "demo_user",
  "planId": "price_xxx"
}
# Show response with clientSecret

# 2. Trigger webhook (use Stripe CLI)
stripe trigger invoice.payment_succeeded

# 3. Show subscription became active
GET /v1/subscriptions/sub_xxx
# Point to "status": "active"

# 4. Show entitlements granted
GET /v1/entitlements/demo_user
# Point to "oneToOne": true
```

### Failed Renewal + Dunning (30 seconds)

```bash
# 1. Trigger failed payment
stripe trigger invoice.payment_failed

# 2. Show subscription → past_due
GET /v1/subscriptions/sub_xxx
# Point to "status": "past_due" and "graceUntil"

# 3. Run dunning job
npm run job:dunning
# Show logs: "Dunning attempt 0", "Sending reminder"

# 4. Fast-forward or explain:
# "At T+7, if still failed, subscription canceled"
# "Entitlements automatically revoked"
```

### Bonus Features (15 seconds)

Quick showcase of:
- IAP validation endpoint
- Wise payout flow
- Ledger entries
- Idempotency (send same webhook twice)

### Conclusion (5 seconds)
- "All tests passing"
```bash
npm test
# Show green checkmarks
```
- "Thank you!"

## 📋 Checklist Before Recording

- [ ] Server running: `npm run dev`
- [ ] Firestore connected
- [ ] Stripe CLI ready: `stripe listen --forward-to localhost:3000/webhooks/stripe`
- [ ] Postman/Thunder Client with saved requests
- [ ] Terminal split-screen for logs
- [ ] Tests passing: `npm test`

## 🎥 Recording Tips

### Tools
- **Screen recording**: OBS Studio, QuickTime (Mac), Windows Game Bar
- **Upload**: Unlisted YouTube video

### Best Practices
- Use large font in terminal (16-18pt)
- Highlight important parts with mouse
- Speak clearly and at moderate pace
- Show don't tell - let code/logs do the talking
- Keep under 2 minutes (aim for 1:45)

## 🎯 Key Points to Highlight

### Architecture (30%)
✓ Provider adapter pattern
✓ Webhook-driven state changes
✓ Idempotent webhook handling
✓ Append-only ledger

### Functionality (40%)
✓ Stripe subscription creation
✓ Webhook processing (verified signature)
✓ State transitions (active → past_due → canceled)
✓ Entitlement management
✓ Dunning flow with grace period

### Data Integrity (20%)
✓ Deduplication works
✓ Ledger captures all events
✓ State machine is correct
✓ Tests pass

### Production Readiness (10%)
✓ Structured logging
✓ Error handling
✓ Type safety (TypeScript)
✓ Clear documentation

## 📝 Sample Script

```
[00:00-00:10]
"Hi, I'm [Name]. This is a production-minded payments service 
built with webhooks as the single source of truth."

[00:10-00:30]
"The architecture uses a provider adapter layer supporting 
Stripe for 1-to-1 sessions, IAP for groups and recordings, 
and Wise for tutor payouts."

[Show folder structure briefly]

[00:30-01:10] HAPPY PATH
"Let me demonstrate the happy path. First, I'll create a 
Stripe subscription..."

[POST to /v1/stripe/subscriptions]

"The API returns a client secret. Now I'll simulate the 
webhook from Stripe..."

[stripe trigger invoice.payment_succeeded]

"Within 60 seconds, the webhook is processed, subscription 
becomes active..."

[GET subscription - show status: active]

"...and entitlements are automatically granted."

[GET entitlements - show oneToOne: true]

[01:10-01:40] FAILED RENEWAL
"Now let's see the dunning flow. I'll trigger a failed payment..."

[stripe trigger invoice.payment_failed]

"Subscription enters past_due status with a 7-day grace period."

[Show graceUntil date]

"The dunning job runs at T+0, T+3, and T+7..."

[npm run job:dunning - show logs]

"Sending reminders and regenerating payment links. If still 
failed at T+7, subscription is automatically canceled and 
entitlements revoked."

[01:40-01:55] BONUS
"The system also handles IAP receipts, Wise payouts, maintains 
an append-only ledger for audit, and ensures idempotent webhook 
processing."

[Quick flashes of these features]

[01:55-02:00]
"All tests passing. Thank you!"

[npm test output with green checkmarks]
```

## 🚀 Upload Instructions

1. Record video (max 2 minutes)
2. Upload to YouTube as **Unlisted**
3. Title: "Payments Service Demo - [Your Name]"
4. In email, include:
   - GitHub repo link
   - YouTube video link
   - Brief summary of assumptions

## 📧 Email Template

```
Subject: [Assignment] Payments Backend – [Your Full Name]

Hi,

Please find my submission for the Payments Backend assignment:

GitHub Repository: https://github.com/yourusername/webhook-api
Demo Video: https://youtu.be/xxxxx (unlisted, ≤2 min)

Key Features Implemented:
✓ Provider adapters (Stripe, IAP, Wise, TazaPay stub)
✓ Webhook-driven architecture with idempotency
✓ Subscription manager with state machine
✓ Dunning flow (T+0/T+3/T+7)
✓ Entitlements service
✓ Append-only ledger
✓ Background jobs (dunning, reconcile)
✓ Comprehensive tests (idempotency, state transitions, IAP)

Assumptions/Limitations:
- IAP receipt validation is mocked (use real Apple/Google APIs in production)
- Wise payout integration is mocked
- TazaPay is a stub only
- Tax calculation is simplified (recommend Stripe Tax for production)

Tech Stack:
- Node.js 18+ with TypeScript
- Express
- Firebase Admin SDK (Firestore)
- Stripe SDK
- Pino for logging
- Jest for testing

All tests pass. The system is ready for local development and 
can be deployed to Cloud Run or similar platforms.

Thank you for your consideration!

Best regards,
[Your Name]
```

## ✅ Final Checklist

Before sending:
- [ ] Video is under 2 minutes
- [ ] Video is unlisted on YouTube
- [ ] GitHub repo is public
- [ ] README is complete
- [ ] .env.example exists
- [ ] Tests pass: `npm test`
- [ ] No credentials in code
- [ ] Clear commit messages
- [ ] Email sent to: studyosystemio@gmail.com

Good luck! 🚀
