# Pre-Production Code Review: Canvas2Calendar

> **Reviewer Perspective**: Senior Engineer evaluating production readiness
> **Focus Areas**: Local Storage, Google APIs, Supabase Integration
> **Date**: 2025-12-28

---

## Executive Summary

The extension has solid architectural foundations—clean separation of concerns with modular packages (`storage`, `google-api`, `supabase`, `ics-parser`), reactive storage abstractions, and well-thought-out Edge Functions for secure backend operations. However, several issues need attention before production, especially around **security**, **error handling**, and **UX polish**.

---

## 🔴 Critical Concerns (Must Fix Before Production)

### 1. RLS Policies May Block User Operations

**Location**: [schema.sql](file:///c:/Users/brand/Documents/VSCode/canvas2calendar/packages/supabase/schema.sql#L24-L35)

The current RLS policies rely on `auth.jwt() ->> 'sub'` to match `google_user_id`:

```sql
CREATE POLICY "Users can view own data" ON users
  FOR SELECT
  USING (auth.jwt() ->> 'sub' = google_user_id);
```

**Problem**: When using `signInWithIdToken`, the JWT claim structure may not have `sub` = Google user ID. Google's `sub` is an opaque identifier that might differ from the `userinfo.id` you're storing.

**Risk**: Users could be locked out of their own data.

**Recommendation**:
1. Log the actual JWT claims in production to verify structure
2. Consider Edge Functions for ALL user data operations (already started with `get-or-create-user`)
3. Or create a custom claim mapping in Supabase Auth hooks

---

### 2. Dual Auth Path Creates Confusion

**Locations**:
- [users.ts](file:///c:/Users/brand/Documents/VSCode/canvas2calendar/packages/supabase/lib/users.ts) - Direct Supabase client calls
- [edge-functions.ts](file:///c:/Users/brand/Documents/VSCode/canvas2calendar/packages/supabase/lib/edge-functions.ts) - Edge Function calls

You have **two paths** for user operations:
1. `upsertUser()` using direct Supabase client (requires RLS to work)
2. `getOrCreateUser()` via Edge Function (bypasses RLS with service key)

**Problem**: In [auth.ts](file:///c:/Users/brand/Documents/VSCode/canvas2calendar/packages/supabase/lib/auth.ts#L57-L66), `signInWithGoogleToken` calls `upsertUser()` directly, but if RLS fails, users silently get no database record.

**Recommendation**: Standardize on Edge Functions for ALL write operations. The direct Supabase client should only be used for reads (if at all).

---

### 3. No Graceful Token Refresh Error Handling in UI

**Location**: [SyncPanel.tsx](file:///c:/Users/brand/Documents/VSCode/canvas2calendar/pages/side-panel/src/SyncPanel.tsx#L92-L114)

When Google token refresh fails (e.g., user revoked access), the error message is generic:

```tsx
setError(err instanceof Error ? err.message : 'Failed to start OAuth');
```

**Problem**: Users don't understand why auth failed or how to fix it.

**Recommendation**:
- Detect specific error types (revoked, expired, network)
- Show actionable messages: "Please sign in again" vs "Check your internet connection"
- Add a "Clear data & retry" option for corrupt state

---

### 4. Local Storage Has No Size Management

**Location**: [canvas-storage.ts](file:///c:/Users/brand/Documents/VSCode/canvas2calendar/packages/storage/lib/impl/canvas-storage.ts)

`eventsStorage` and `tasksStorage` can grow unbounded:

```typescript
const eventsStorage = createStorage<EventsMapState>(STORAGE_KEYS.EVENTS, DEFAULT_EVENTS, {
  storageEnum: StorageEnum.Local,
  liveUpdate: false, // Large object, avoid live updates for perf
});
```

**Problem**: `chrome.storage.local` has a 5MB limit (10MB with `unlimitedStorage` permission). Heavy Canvas users could hit this.

**Risk**: Silent data loss or sync failures.

**Recommendation**:
1. Track storage usage with `chrome.storage.local.getBytesInUse()`
2. Implement event pruning (remove events older than X days)
3. Show warning when approaching limit
4. Document `unlimitedStorage` permission requirement in manifest

---

## 🟡 Important Issues (Fix Before Stripe)

### 5. Subscription Check Has No Caching

**Location**: [edge-functions.ts](file:///c:/Users/brand/Documents/VSCode/canvas2calendar/packages/supabase/lib/edge-functions.ts#L61-L86)

```typescript
export const checkSubscription = async (googleUserId: string): Promise<SubscriptionResponse> => {
  // Makes HTTP request on EVERY call
  const response = await fetch(...);
  ...
}
```

**Problem**: Before Stripe integration, you'll be calling this frequently (on sync, on UI load, on feature access). Each call is a network round-trip.

**Recommendation**:
1. Cache subscription status in `chrome.storage.local` with a TTL (e.g., 5 minutes)
2. Invalidate cache on user logout or subscription change webhook

---

### 6. No Feature Gating Implementation

**Issue**: The pricing doc defines Free vs Pro features, but there's no code that actually gates features:

| Feature | Free | Pro |
|---------|------|-----|
| Sync Frequency | 1/24h | 1/15min |
| Manual Sync | No | Yes |
| Customization | Limited | Full |

**Current State**: Free users can sync manually anytime via the UI.

**Recommendation** before Stripe:
1. Create a `useFeatureFlags()` hook that checks subscription tier
2. Gate the "Sync Now" button for free tier
3. Add "last synced" timestamp check to prevent frequent syncs
4. Show upgrade prompts at gate points

---

### 7. Preferences Version Conflict Potential

**Location**: [preferences.ts](file:///c:/Users/brand/Documents/VSCode/canvas2calendar/packages/supabase/lib/preferences.ts#L50)

```typescript
version: 1, // TODO: Implement version incrementing for conflict detection
```

**Problem**: If users sync preferences from multiple devices (Pro feature), there's no conflict resolution. Last write wins silently.

**Recommendation before cloud sync**:
1. Increment version on each save
2. Compare versions before writing
3. Show conflict resolution UI or use last-modified timestamp

---

### 8. Edge Function Error Responses Not Typed

**Location**: [edge-functions.ts](file:///c:/Users/brand/Documents/VSCode/canvas2calendar/packages/supabase/lib/edge-functions.ts#L49-L52)

```typescript
const error = await response.json().catch(() => ({ error: 'Unknown error' }));
throw new Error(error.error || `Failed to get/create user: ${response.status}`);
```

**Problem**: No distinction between:
- Network errors
- Auth errors (wrong API key)
- Server errors (Edge Function crashed)
- Business logic errors (user banned)

**Recommendation**:
1. Define error response types from Edge Functions
2. Create custom exception classes (like `GoogleApiException`)
3. Handle each error type appropriately in UI

---

## 🟢 UX Improvements (Polish Before Launch)

### 9. Debug Logs in Production UI

**Location**: [SyncPanel.tsx](file:///c:/Users/brand/Documents/VSCode/canvas2calendar/pages/side-panel/src/SyncPanel.tsx#L203-L237)

The debug panel is visible to end users. While useful for beta, it's confusing for production.

**Recommendation**:
1. Hide behind a "Developer mode" toggle in options
2. Or remove entirely and use `chrome.runtime.getManifest().version` to show version info
3. Keep logs in `chrome.storage.local` but only show in options page

---

### 10. No Loading State for Initial Auth Check

**Location**: [SyncPanel.tsx](file:///c:/Users/brand/Documents/VSCode/canvas2calendar/pages/side-panel/src/SyncPanel.tsx#L46-L75)

```tsx
const init = async () => {
  try {
    const result = await user.getPreferences();
    // ...
  } catch {
    setIsAuthenticated(false);
  }
};
```

**Problem**: There's a brief moment where `isAuthenticated` is `false` before the check completes, causing a flash of the login screen even for authenticated users.

**Recommendation**:
1. Add `isLoading` state, default `true`
2. Show skeleton/spinner during init
3. Only render auth-dependent content after check completes

---

### 11. Missing "Sync in Progress" Feedback

**Location**: [SyncPanel.tsx](file:///c:/Users/brand/Documents/VSCode/canvas2calendar/pages/side-panel/src/SyncPanel.tsx#L366-L375)

The sync button shows "Syncing..." but there's no progress indication for long syncs.

**Recommendation**:
- Show which step is happening: "Fetching calendar...", "Syncing events...", "Updating tasks..."
- Could use the reactive `syncStateStorage` that already tracks this

---

### 12. ICS URL Validation Minimal

**Location**: [SyncPanel.tsx](file:///c:/Users/brand/Documents/VSCode/canvas2calendar/pages/side-panel/src/SyncPanel.tsx#L146-L159)

No validation that the URL:
1. Is a valid URL format
2. Ends in `.ics` or looks like a Canvas feed
3. Is actually reachable

**Recommendation**:
1. Add URL format validation before save
2. Test-fetch the URL to verify it's a valid ICS
3. Show helpful error if it's a Canvas page URL, not the feed URL

---

## 📋 Prioritized Pre-Stripe Checklist

### Must Do (Blocking)
1. [ ] Verify RLS policies work with actual JWT claims (or move to Edge Functions only)
2. [ ] Implement subscription caching in local storage
3. [ ] Add basic feature gating (sync frequency limits at minimum)
4. [ ] Add storage size monitoring and warnings

### Should Do (High Value)
5. [ ] Fix auth error handling with actionable messages
6. [ ] Add loading state for initial auth check
7. [ ] Hide debug logs behind developer mode
8. [ ] Standardize on Edge Functions for all user data operations

### Nice to Have (Polish)
9. [ ] Progress feedback during sync
10. [ ] ICS URL validation
11. [ ] Event pruning for storage management
12. [ ] Preference version conflict detection

---

## Technical Debt Already Tracked

Your [potential-tech-debt.md](file:///c:/Users/brand/Documents/VSCode/canvas2calendar/documentation/potential-tech-debt.md) already covers several important items:

- ✅ Preference-based cleanup (High Priority #1, #2)
- ✅ Token retry logic (#3) - **Partially implemented** in `googleFetch`
- ✅ Rate limiting (#8)
- ✅ Sync notifications (#9)

**Note**: Item #3 (401 retry) is actually already implemented in [auth.ts:346-353](file:///c:/Users/brand/Documents/VSCode/canvas2calendar/packages/google-api/lib/auth.ts#L346-L353). You can mark that as done!

---

## Architecture Observations (Good Patterns)

Things you're doing well:

1. **Edge Functions for sensitive operations** - `get-or-create-user` and `check-subscription` properly protect server-side logic
2. **Reactive storage with live updates** - The `createStorage` abstraction is clean and supports cross-context updates
3. **Silent token refresh** - Proactive refresh when token is expiring soon is excellent UX
4. **Self-healing sync** - Already implemented for deleted calendars/tasks
5. **Modular package structure** - Easy to test and maintain independently
