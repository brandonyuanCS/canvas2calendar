# Architectural Migration Plan: Centralized to Local-First

> **Last Updated**: 2024-12-23  
> **Status**: ✅ Phase 1 & 2 Complete, Phase 3 (Monetization) Planned


---

## Executive Summary

This document outlines the strategy for migrating **canvas2calendar** from a centralized, server-side architecture to a **decentralized, local-first model** with **Stripe + Supabase** for monetization.

### Core Principles
- **Privacy First**: Sensitive data (Canvas ICS URLs, Google tokens) never leave the user's browser
- **Zero-Cost Sync**: All sync logic runs locally—no server costs for core functionality
- **Minimal Backend**: Only for subscription verification (Stripe + Supabase)
- **PostgreSQL Deprecated**: Legacy code retained for reference, but not used in production

---

## Table of Contents

1. [Current Architecture Status](#1-current-architecture-status)
2. [Target Architecture](#2-target-architecture)
3. [Phase 1: Local Sync Engine (PARTIALLY COMPLETE)](#3-phase-1-local-sync-engine)
4. [Phase 2: Message Handler Completion (CURRENT)](#4-phase-2-message-handler-completion)
5. [Phase 3: Monetization Layer (Stripe + Supabase)](#5-phase-3-monetization-layer)
6. [Phase 4: Frontend Migration](#6-phase-4-frontend-migration)
7. [Phase 5: Cleanup & Polish](#7-phase-5-cleanup--polish)
8. [Known Issues & Technical Debt](#8-known-issues--technical-debt)
9. [Deprecated Components](#9-deprecated-components)

---

## 1. Current Architecture Status

### What's Working ✅
| Component | Status | Location |
|-----------|--------|----------|
| Google API Client (fetch-based) | ✅ Complete | `packages/google-api/` |
| ICS Parser | ✅ Complete | `packages/ics-parser/` |
| Canvas Storage Types | ✅ Complete | `packages/storage/lib/impl/` |
| Background Script (core sync) | ✅ Complete | `chrome-extension/src/background/index.ts` |
| Web Crypto Hashing | ✅ Complete | `chrome-extension/src/background/utils/hash.ts` |
| Endpoints → Message Passing | ✅ Refactored | `packages/shared/lib/api/endpoints.ts` |

### What's Broken 🔴
| Issue | Severity | Description |
|-------|----------|-------------|
| Missing Message Handlers | 🔴 Critical | `GET_STATUS`, `GET_USER`, `SET_ICS_URL`, `CREATE_CALENDAR`, `RESET_ALL` not implemented in background |
| OAuth Client Type | 🔴 Critical | Need Chrome App OAuth client, not Web Application |
| Response Format Mismatch | 🟡 Medium | Background handlers may not return `{ success, data, error }` format |
| Dead Code | 🟡 Low | `packages/shared/lib/api/client.ts` is unused |
| SyncReport Type Mismatch | 🟡 Medium | UI expects `ApiSyncReport`, background generates different structure |

---

## 2. Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER'S BROWSER                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌──────────────────────────────────────────────┐   │
│  │  Popup / UI     │◄──►│  Background Service Worker                   │   │
│  │  (React)        │    │  ┌────────────────────────────────────────┐  │   │
│  │                 │    │  │ Message Router                         │  │   │
│  │  - Auth State   │    │  │ - SIGN_IN/OUT → chrome.identity        │  │   │
│  │  - Sync Status  │    │  │ - SYNC_NOW → SyncEngine                │  │   │
│  │  - Preferences  │    │  │ - GET_USER → chrome.storage.local      │  │   │
│  │  - Reports      │    │  │ - CREATE_CALENDAR → Google API         │  │   │
│  └─────────────────┘    │  └────────────────────────────────────────┘  │   │
│                         │                                              │   │
│                         │  ┌────────────────────────────────────────┐  │   │
│                         │  │ Storage Layer (chrome.storage.local)   │  │   │
│                         │  │ - userStorage (email, name, icsUrl)    │  │   │
│                         │  │ - calendarStorage (calendarId)         │  │   │
│                         │  │ - eventsStorage (uid → googleEventId)  │  │   │
│                         │  │ - tasksStorage (uid → googleTaskId)    │  │   │
│                         │  │ - syncStateStorage (lastSync, status)  │  │   │
│                         │  └────────────────────────────────────────┘  │   │
│                         └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
           ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐
           │ Canvas LMS   │  │ Google APIs  │  │ Supabase + Stripe    │
           │ (ICS Feed)   │  │ (Calendar,   │  │ (Subscription Only)  │
           │              │  │  Tasks)      │  │                      │
           └──────────────┘  └──────────────┘  └──────────────────────┘
```

---

## 3. Phase 1: Local Sync Engine

**Status**: ✅ COMPLETE (with issues to address in Phase 2)

### Completed Work

#### 3.1 Package Structure
```
packages/
├── google-api/           # ✅ Lightweight fetch-based Google Calendar/Tasks client
│   ├── lib/auth.ts       # chrome.identity wrapper, googleFetch helper
│   ├── lib/calendar.ts   # CalendarAPI class
│   ├── lib/tasks.ts      # TasksAPI class
│   └── lib/types.ts      # Google API response types
│
├── ics-parser/           # ✅ ICS feed parser
│   ├── lib/parser.ts     # ICSParser class (uses ical.js)
│   └── lib/validator.ts  # Canvas URL validation
│
├── storage/              # ✅ Extended with Canvas2Cal storage
│   └── lib/impl/
│       ├── canvas-types.ts    # Storage state interfaces
│       └── canvas-storage.ts  # Reactive storage instances
│
└── shared/               # ✅ Refactored API layer
    └── lib/api/
        └── endpoints.ts  # Now uses chrome.runtime.sendMessage
```

#### 3.2 Background Script
- `chrome-extension/src/background/index.ts` - Main service worker
- Handles: `SIGN_IN`, `SIGN_OUT`, `SYNC_NOW`, `UPDATE_PREFERENCES`
- Implements: Periodic sync via `chrome.alarms`
- Uses: All new packages (`@extension/google-api`, `@extension/ics-parser`, `@extension/storage`)

#### 3.3 Hashing
- `chrome-extension/src/background/utils/hash.ts`
- Uses Web Crypto API (`crypto.subtle`) for SHA-256
- Browser-compatible replacement for Node's `crypto`

---

## 4. Phase 2: Message Handler Completion

**Status**: 🔴 CURRENT PRIORITY

### 4.1 Missing Handlers to Implement

Add these handlers to `chrome-extension/src/background/index.ts`:

| Message Type | Purpose | Implementation |
|--------------|---------|----------------|
| `GET_STATUS` | Check auth/setup state | Return `{ isAuthenticated, hasCalendar, hasIcsUrl }` |
| `GET_USER` | Get user data | Return user storage data |
| `SET_ICS_URL` | Save Canvas feed URL | Update userStorage |
| `CREATE_CALENDAR` | Create Google Calendar | Call CalendarAPI.createCalendar() |
| `RESET_ALL` | Clear all data | Clear storage + delete Google resources |

### 4.2 Response Format Standardization

All handlers must return:
```typescript
{
  success: boolean;
  data?: T;        // On success
  error?: string;  // On failure
}
```

### 4.3 OAuth Configuration

**Required**: Create a **Chrome App** type OAuth client in Google Cloud Console.

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create OAuth Client → **Chrome App**
3. Enter Extension ID from `chrome://extensions/`
4. Add client_id to `chrome-extension/manifest.ts`:

```typescript
oauth2: {
  client_id: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
  scopes: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ],
},
```

### 4.4 Tasks
- [ ] Implement `GET_STATUS` handler
- [ ] Implement `GET_USER` handler  
- [ ] Implement `SET_ICS_URL` handler
- [ ] Implement `CREATE_CALENDAR` handler
- [ ] Implement `RESET_ALL` handler
- [ ] Standardize all handler response formats
- [ ] Create Chrome App OAuth client
- [ ] Test full auth → sync flow

---

## 5. Phase 3: Monetization Layer

**Status**: 📋 PLANNED

### 5.1 Architecture

```
┌─────────────────────┐     ┌─────────────────────────────────────────┐
│ Chrome Extension    │     │           Supabase                      │
│                     │     │  ┌─────────────────────────────────┐   │
│ 1. Get Google email │     │  │ Table: subscriptions            │   │
│    (chrome.identity)│     │  │ - email (PK)                    │   │
│                     │     │  │ - stripe_customer_id            │   │
│ 2. Check subscription│────▶│  │ - status (active/cancelled)    │   │
│    via Supabase     │     │  │ - current_period_end            │   │
│                     │◀────│  │ - tier (free/pro)               │   │
│ 3. Cache result     │     │  └─────────────────────────────────┘   │
│    locally          │     │                                        │
└─────────────────────┘     │  Edge Function: /check-subscription    │
                            │  - Input: email                         │
                            │  - Output: { isPaid, tier, expiresAt } │
                            └─────────────────────────────────────────┘
                                              ▲
                                              │ Webhook
                            ┌─────────────────┴─────────────────┐
                            │           Stripe                   │
                            │  - Handles payments                │
                            │  - Sends subscription events       │
                            │  - customer.subscription.created   │
                            │  - customer.subscription.updated   │
                            │  - customer.subscription.deleted   │
                            └────────────────────────────────────┘
```

### 5.2 Supabase Setup

**Database Schema**:
```sql
CREATE TABLE subscriptions (
  email TEXT PRIMARY KEY,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  status TEXT CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro')),
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Only the edge function can read/write
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
```

**Edge Function** (`supabase/functions/check-subscription/index.ts`):
```typescript
export async function handler(req: Request) {
  const { email } = await req.json();
  
  const { data } = await supabase
    .from('subscriptions')
    .select('status, tier, current_period_end')
    .eq('email', email)
    .single();
  
  return new Response(JSON.stringify({
    isPaid: data?.status === 'active' && data?.tier === 'pro',
    tier: data?.tier || 'free',
    expiresAt: data?.current_period_end,
  }));
}
```

### 5.3 Stripe Webhook Handler

Edge function to handle Stripe events and update Supabase.

### 5.4 Extension Integration

```typescript
// In background script
async function checkSubscription(): Promise<SubscriptionStatus> {
  const user = await userStorage.get();
  if (!user?.email) return { isPaid: false, tier: 'free' };
  
  // Check cache first (valid for 1 hour)
  const cached = await subscriptionCache.get();
  if (cached && Date.now() < cached.checkedAt + 3600000) {
    return cached;
  }
  
  // Call Supabase edge function
  const response = await fetch('https://YOUR_PROJECT.supabase.co/functions/v1/check-subscription', {
    method: 'POST',
    body: JSON.stringify({ email: user.email }),
  });
  
  const status = await response.json();
  await subscriptionCache.set({ ...status, checkedAt: Date.now() });
  return status;
}
```

### 5.5 Tasks
- [ ] Create Supabase project
- [ ] Set up subscriptions table
- [ ] Create Stripe account and products
- [ ] Implement webhook handler edge function
- [ ] Implement check-subscription edge function
- [ ] Add subscription check to extension
- [ ] Implement free tier limits (if any)
- [ ] Create payment/upgrade UI

---

## 6. Phase 4: Frontend Migration

**Status**: 📋 PLANNED

### 6.1 Current State
- Popup at `pages/popup/src/Popup.tsx` - ✅ Updated to use message passing
- Side Panel at `pages/side-panel/src/SyncPanel.tsx` - ✅ Updated to use message passing

### 6.2 Target State
- Move to content-injected modal OR enhanced popup
- Remove side panel dependency
- More screen real estate for preferences and logs

### 6.3 Tasks
- [ ] Design new UI layout
- [ ] Implement content script injection (if going modal route)
- [ ] Migrate existing UI components
- [ ] Remove side panel related code

---

## 7. Phase 5: Cleanup & Polish

**Status**: 📋 PLANNED

### 7.1 Code Cleanup
- [ ] Remove `packages/shared/lib/api/client.ts` (dead code)
- [ ] Remove legacy PostgreSQL/Prisma references (keep in separate branch for reference)
- [ ] Clean up unused imports across all files
- [ ] Verify all TypeScript types align between background and UI

### 7.2 Error Handling
- [ ] Implement 401 token expiration retry in `googleFetch`
- [ ] Add exponential backoff for Google API calls
- [ ] Add user-friendly error messages

### 7.3 Testing
- [ ] End-to-end sync flow testing
- [ ] Subscription check testing
- [ ] Token refresh testing
- [ ] Service worker restart resilience testing

---

## 8. Known Issues & Technical Debt

See `internal-documentation/tech-debt-tracker.md` for detailed tracking.

### Critical
1. **Missing message handlers** - UI cannot function without GET_STATUS, GET_USER, etc.
2. **OAuth client type** - Need Chrome App client, not Web Application

### Medium
1. **Response format inconsistency** - Need to standardize all handlers
2. **SyncReport type mismatch** - UI expects different structure than background generates
3. **No token refresh logic** - 401 errors not handled

### Low
1. **Dead code** - `client.ts` unused
2. **Lint warning** - `@extension/tsconfig/base.json` not found (false positive)

---

## 9. Deprecated Components

The following are **no longer used** but retained for reference:

| Component | Location | Reason for Deprecation |
|-----------|----------|------------------------|
| PostgreSQL Database | `api/prisma/` | Replaced by chrome.storage.local |
| Express API Server | `api/` | Replaced by background service worker |
| Node.js Google SDK | (was in api/) | Replaced by `@extension/google-api` |
| Server-side OAuth | `api/src/routes/auth.ts` | Replaced by chrome.identity |
| JWT Authentication | `api/src/middleware/` | No longer needed (local-first) |

### Migration Notes
- Keep `api/` directory in a separate git branch for reference
- Useful for porting remaining logic (e.g., detailed sync algorithm)
- Can be deleted after Phase 5 is complete

---

## Appendix: Environment Variables

### Required for Extension
```
# In manifest.ts oauth2 block
client_id=YOUR_CHROME_APP_CLIENT_ID.apps.googleusercontent.com
```

### Required for Monetization (Phase 3)
```
# Supabase
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
```

### Deprecated (No Longer Used)
```
# These were for the old backend
DATABASE_URL=postgresql://...
JWT_SECRET=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=...
```