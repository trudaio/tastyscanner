# Deployment Guide

> How to build, deploy, monitor, and roll back TastyScanner (hosting + Cloud Functions).

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20.x | `nvm install 20 && nvm use 20` |
| npm | 10.x+ | Bundled with Node 20 |
| Firebase CLI | 15.5+ | `npm install -g firebase-tools` |
| gcloud CLI | (optional) | For advanced GCP console access |
| TypeScript | 5.9 | Project dependency (no global install needed) |

Log in to Firebase:
```bash
firebase login
firebase use operatiunea-guvidul
```

## Environment Configuration

### Frontend (.env.local)

Create `.env.local` in the project root. Vite requires the `VITE_` prefix for client-side variables:

```env
VITE_FIREBASE_API_KEY=<your-firebase-api-key>
VITE_FIREBASE_AUTH_DOMAIN=operatiunea-guvidul.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=operatiunea-guvidul
VITE_FIREBASE_STORAGE_BUCKET=operatiunea-guvidul.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=<sender-id>
VITE_FIREBASE_APP_ID=<app-id>
VITE_FUNCTIONS_BASE_URL=https://us-central1-operatiunea-guvidul.cloudfunctions.net
```

Optional dev fallback (bypasses credential fetch for local development):
```env
VITE_CLIENT_SECRET=<tastytrade-client-secret>
VITE_REFRESH_TOKEN=<tastytrade-refresh-token>
```

### Firebase Secrets (Cloud Functions)

Secrets are managed via Firebase Secret Manager. Set them once:

```bash
# Required for AI agent functions
firebase functions:secrets:set ANTHROPIC_API_KEY
# Paste: sk-ant-api03-...

# Required for credential encryption
firebase functions:secrets:set ENCRYPTION_KEY
# Paste: 64-character hex string (32 bytes)

# Required for IBKR OAuth (can be placeholder if not using IBKR)
firebase functions:secrets:set IBKR_CONSUMER_SECRET

# Required for Polygon.io proxy
firebase functions:secrets:set POLYGON_API_KEY
```

To verify secrets exist:
```bash
firebase functions:secrets:access ANTHROPIC_API_KEY
```

## Build Process

### Frontend Build

```bash
# Install dependencies
npm install

# Type check (must pass with zero errors)
npx tsc --noEmit

# Production build (tsc + vite build -> dist/)
npm run build

# Preview production build locally
npm run preview
```

The build outputs to `dist/` which is the Firebase Hosting public directory (configured in `firebase.json`).

### Functions Build

```bash
cd functions

# Install dependencies
npm install

# Build (tsc + copy best-practices.md to lib/shared/)
npm run build

cd ..
```

The functions build outputs to `functions/lib/`. The `best-practices.md` file is copied to `lib/shared/` because it is loaded at runtime by the LLM prompt builder.

## Deploy Hosting

```bash
# Build first
npm run build

# Deploy hosting only
firebase deploy --only hosting
```

**What this does:**
- Uploads `dist/` to Firebase Hosting CDN
- SPA rewrite rule sends all routes to `index.html` (configured in `firebase.json`)
- Security headers (CSP, HSTS, X-Frame-Options) are applied automatically
- Live at https://operatiunea-guvidul.web.app within ~30 seconds

## Deploy Functions

### Per-Function Deployment (Recommended)

Deploy individual functions to minimize risk and deployment time:

```bash
# Deploy the HTTP API function
firebase deploy --only functions:api

# Deploy the daily AI picker
firebase deploy --only functions:aiDailySubmit

# Deploy the close checker
firebase deploy --only functions:closeCheck

# Deploy the learning trigger
firebase deploy --only functions:aiLearning

# Deploy the weekly reflector
firebase deploy --only functions:weeklyReflect
```

### Deploy All Functions

```bash
firebase deploy --only functions
```

### Which Secrets Each Function Needs

| Function | Required Secrets |
|----------|-----------------|
| api | `ENCRYPTION_KEY`, `IBKR_CONSUMER_SECRET`, `POLYGON_API_KEY` |
| aiDailySubmit | `ANTHROPIC_API_KEY`, `ENCRYPTION_KEY` |
| closeCheck | `ENCRYPTION_KEY` |
| aiLearning | (none -- reads/writes Firestore only) |
| weeklyReflect | `ANTHROPIC_API_KEY` |

If a required secret is missing, the function will fail at runtime with a clear error message (e.g., `ENCRYPTION_KEY must be a 64-char hex string`).

## First-Time Setup

### 1. Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

This applies the security rules from `firestore.rules` that enforce user isolation.

### 2. Deploy Functions for the First Time

When deploying a Firestore-triggered function (`aiLearning`) for the first time, there is a known ~2 minute wait for Eventarc (the GCP eventing system) to provision the trigger:

```bash
firebase deploy --only functions:aiLearning
# Wait ~2 minutes before testing
```

You will see a message like: "Eventarc trigger creation is in progress..." This is normal.

### 3. Create Superadmin User

After the first user registers via the app:

```bash
cd functions
node scripts/create-superadmin.js <user-uid>
```

This sets the `role: 'superadmin'` custom claim on the user's Firebase Auth token, enabling access to `/superadmin` page and admin API endpoints.

### 4. Verify Cloud Scheduler Jobs

After deploying scheduled functions, verify the jobs exist in GCP:

```bash
# List all scheduler jobs
gcloud scheduler jobs list --project=operatiunea-guvidul

# Expected output:
# aiDailySubmit  30 14 * * 1-5  America/New_York
# closeCheck     0 21 * * 1-5   UTC
# weeklyReflect  0 1 * * 1      UTC
```

Or verify in the [GCP Cloud Scheduler console](https://console.cloud.google.com/cloudscheduler?project=operatiunea-guvidul).

### 5. Test a Function Manually

For scheduled functions, you can trigger them manually from the GCP console or via:

```bash
# Trigger aiDailySubmit manually (useful for testing)
gcloud scheduler jobs run firebase-schedule-aiDailySubmit --project=operatiunea-guvidul
```

## Monitoring

### Function Logs

```bash
# Stream all function logs
firebase functions:log

# Filter by function name
firebase functions:log --only aiDailySubmit

# In GCP Console (more filtering options):
# https://console.cloud.google.com/logs?project=operatiunea-guvidul
```

Look for log prefixes:
- `[aiDailySubmit]` -- Daily picker progress and results
- `[closeCheck]` -- Position close decisions
- `[weeklyReflect]` -- Memo generation
- `[API Error]` -- Credential or proxy failures
- `[polygon/*]` -- Polygon.io proxy issues

### Firestore Audit Trail

Every Claude API call is logged to `users/{uid}/aiAuditLog/{logId}` with:
- Model used (opus/sonnet)
- Token counts (input/output)
- Cost in USD
- Duration in ms
- Purpose (picker/risk-manager/reflector)

Query audit logs in the [Firestore console](https://console.firebase.google.com/project/operatiunea-guvidul/firestore) or via the SuperAdmin page in the app.

### Budget Monitoring

The `llm-client.ts` enforces a daily budget cap (default $10/day). If exceeded:
- `BudgetExceededError` is thrown
- The function logs the exceeded budget and exits gracefully
- Remaining tickers/expirations for that day are skipped

To check current day spend, query `aiAuditLog` where `createdAt` is today and sum `costUsd`.

## Rollback Strategy

### Hosting Rollback

Firebase Hosting keeps previous versions. Roll back via the console:

1. Go to [Firebase Hosting](https://console.firebase.google.com/project/operatiunea-guvidul/hosting)
2. Click the previous deployment under "Release history"
3. Click "Rollback"

Or via CLI:
```bash
# List recent deployments
firebase hosting:channel:list

# Rollback to a specific version (get version ID from console)
firebase hosting:rollback
```

### Functions Rollback

Cloud Functions do not have built-in rollback. To revert:

1. Check out the previous commit in git
2. Rebuild and redeploy the specific function:
```bash
git checkout <previous-commit> -- functions/
cd functions && npm run build && cd ..
firebase deploy --only functions:aiDailySubmit
```

3. Alternatively, revert the commit and deploy:
```bash
git revert <bad-commit>
cd functions && npm run build && cd ..
firebase deploy --only functions
```

### Emergency: Disable a Scheduled Function

If a scheduled function is misbehaving, pause it from GCP:

```bash
gcloud scheduler jobs pause firebase-schedule-aiDailySubmit --project=operatiunea-guvidul
```

Resume when fixed:
```bash
gcloud scheduler jobs resume firebase-schedule-aiDailySubmit --project=operatiunea-guvidul
```

## Cost Monitoring

| Resource | Cost Driver | Monitor |
|----------|-------------|---------|
| Claude API | Token usage per daily/weekly calls | `aiAuditLog` collection + budget cap |
| Firebase Functions | Invocation count + compute time | GCP Billing console |
| Firestore | Read/write operations | GCP Billing console |
| Firebase Hosting | Bandwidth (minimal for SPA) | Firebase console |
| Polygon.io | API calls via proxy | Polygon.io dashboard |

Set up GCP budget alerts:
```bash
gcloud billing budgets create \
    --billing-account=<account-id> \
    --display-name="TastyScanner Monthly" \
    --budget-amount=50 \
    --threshold-rule=percent=80 \
    --threshold-rule=percent=100
```

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Function deploy fails with "secret not found" | Secret not set in Firebase | `firebase functions:secrets:set <NAME>` |
| aiLearning trigger doesn't fire | Eventarc not provisioned | Wait 2 min after first deploy; redeploy if needed |
| CORS error on API calls | Origin not in allowlist | Add origin to `ALLOWED_ORIGINS` in `functions/src/index.ts` |
| `ENCRYPTION_KEY must be a 64-char hex string` | Missing or wrong-length key | Regenerate with `openssl rand -hex 32` and set via secrets |
| Cloud Scheduler job not listed | Function not deployed to correct region | Ensure `region: 'us-east1'` in function config |
| Build fails with TS errors | TypeScript strict mode violation | Fix errors, run `npx tsc --noEmit` until clean |

## See Also

- [System Architecture](system-architecture.md) -- Function descriptions and data flow
- [Codebase Summary](codebase-summary.md) -- Full function and service inventory
- [Code Standards](code-standards.md) -- Build and type-check requirements

---

*Last updated: 2026-04-13*
