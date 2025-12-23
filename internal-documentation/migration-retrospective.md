# Migration Retrospective: Local-First Architecture

> **Date**: 2024-12-23  
> **Session Duration**: ~2 hours  
> **Status**: ✅ Phase 1 & 2 Complete - Core functionality restored

---

## Executive Summary

Successfully migrated canvas2calendar from a centralized server architecture to a fully **local-first Chrome Extension**. All core sync functionality now runs entirely in the browser's service worker, with no backend dependency for the main features.

---

## ✅ What Was Accomplished

### 1. Authentication Flow

| Before | After |
|--------|-------|
| Server-side OAuth with JWT tokens | `chrome.identity.launchWebAuthFlow` |
| PostgreSQL user table | `chrome.storage.local` |
| Session cookies | Token cached in extension storage |

**Key Changes:**
- Switched from `chrome.identity.getAuthToken` to `launchWebAuthFlow` (more reliable with Web Application OAuth clients)
- Token caching with expiry tracking in `chrome.storage.local`
- Environment variable support (`GOOGLE_CLIENT_ID` from `.env`)

### 2. Message Passing Architecture

All frontend-to-background communication now uses `chrome.runtime.sendMessage`:

```typescript
// Frontend (endpoints.ts)
const result = await sendMessage({ type: 'SYNC_NOW' });

// Background (index.ts)
case 'SYNC_NOW': {
  const report = await runSync();
  return { success: true, data: report };
}
```

**Implemented Handlers:**
- `SIGN_IN` / `SIGN_OUT` - Authentication
- `SYNC_NOW` - Manual sync trigger
- `GET_STATUS` - Auth/setup state check
- `GET_USER` - Get user data
- `SET_ICS_URL` - Save Canvas feed URL
- `UPDATE_PREFERENCES` - Save sync preferences
- `CREATE_CALENDAR` - Create Google Calendar
- `RESET_ALL` - Clear all data
- `GET_CANVAS_METADATA` - Fetch course list from ICS

### 3. Self-Healing Sync Logic

The sync engine now gracefully handles externally deleted resources:

| Resource | Detection | Recovery |
|----------|-----------|----------|
| Calendar | `getCalendar()` 404 | Recreate calendar, clear events, re-sync |
| Event | `updateEvent()` 404 | Delete local ref, recreate event |
| Task List | `getTaskList()` 404 | Clear tasks for course, recreate list |
| Task | `updateTask()` 404 | Delete local ref, recreate task |

**GoogleApiException** class added to detect HTTP status codes (404, 410, 401).

### 4. Preference-Aware Sync

Sync now respects user preferences for deletion:

- **Excluded Courses**: Events/tasks for unselected courses are deleted
- **Date Range**: Events/tasks outside configured range are deleted
- **Event Types**: Only sync selected types (event/assignment)

### 5. Data Persistence Improvements

- `SIGN_OUT` no longer clears calendar/task/ICS data (only auth tokens)
- `SIGN_IN` merges with existing user data (preserves ICS URL, preferences)
- Preferences are properly saved and restored

---

## 📁 Files Modified

### Core Background Logic
| File | Changes |
|------|---------|
| `chrome-extension/src/background/index.ts` | Complete rewrite - all message handlers, sync logic, self-healing |
| `chrome-extension/src/background/utils/hash.ts` | Web Crypto API hashing |

### API Layer
| File | Changes |
|------|---------|
| `packages/google-api/lib/auth.ts` | `launchWebAuthFlow`, `GoogleApiException`, token caching |
| `packages/google-api/lib/calendar.ts` | Calendar API wrapper |
| `packages/google-api/lib/tasks.ts` | Tasks API wrapper |
| `packages/shared/lib/api/endpoints.ts` | Message passing wrappers |

### Storage
| File | Changes |
|------|---------|
| `packages/storage/lib/impl/canvas-storage.ts` | Reactive storage instances |
| `packages/storage/lib/impl/canvas-types.ts` | Storage state interfaces |

### UI
| File | Changes |
|------|---------|
| `pages/popup/src/Popup.tsx` | Uses new auth flow |
| `pages/side-panel/src/SyncPanel.tsx` | Uses new auth flow |
| `pages/options/src/Options.tsx` | Fetches Canvas metadata for course list |

### Configuration
| File | Changes |
|------|---------|
| `chrome-extension/manifest.ts` | Removed `oauth2` block (using launchWebAuthFlow) |
| `.env` | `GOOGLE_CLIENT_ID` for Web Application OAuth client |

---

## ⚠️ Important Caveats for the Future

### 1. OAuth Configuration

**Current Setup:**
- Using **Web Application** OAuth client (not Chrome App)
- `launchWebAuthFlow` requires redirect URI: `https://<extension-id>.chromiumapp.org/`
- Extension ID changes between development and production builds!

**Action Required for Production:**
1. Build production extension (`pnpm build`)
2. Get the production extension ID from `chrome://extensions/`
3. Add production redirect URI to Google Cloud Console
4. Consider using `chrome.identity.getAuthToken` for Chrome Web Store distribution

### 2. Environment Variables

**Build-Time Injection:**
- `GOOGLE_CLIENT_ID` is read from `process.env` at build time
- Vite injects it during bundling
- If `.env` is missing or wrong, auth will fail with `invalid_client`

**Sensitive Data:**
- Never commit `.env` to git
- Keep `.example.env` updated as reference

### 3. Service Worker Lifecycle

**Chrome Behavior:**
- Service workers terminate after ~30 seconds of inactivity
- Long-running syncs may be interrupted
- Current sync doesn't implement resumption

**Future Improvement:**
- Store sync progress in `syncStateStorage`
- Check for incomplete sync on startup
- Implement batch processing with progress tracking

### 4. Rate Limiting

**Google API Limits:**
- Calendar API: 1,000,000 queries/day (generous)
- Tasks API: Similar limits
- Per-user quota may apply

**Current Status:**
- No rate limiting implemented
- No exponential backoff on 429 errors

**Future Improvement:**
- Add retry logic with backoff
- Queue requests and batch where possible

### 5. Default Preferences

**Current Defaults:**
```typescript
calendar: { event_types: ['event'] }
tasks: { event_types: ['assignment'] }
```

**Implication:**
- Most Canvas items are "assignment" type
- Users may sync and see nothing in calendar (only events, not assignments)
- Consider defaulting to both, or guiding user in onboarding

### 6. Token Refresh

**Current Implementation:**
- 401 errors clear the cached token
- Next request will prompt re-authentication

**Missing:**
- Silent refresh token flow
- Proactive token refresh before expiry

### 7. Multi-Device Sync

**Current Limitation:**
- Each browser/device has independent state
- No cloud backup of preferences
- No sync of which events are already synced

**Future Consideration:**
- Supabase could store user preferences
- Event UIDs could be stored server-side for deduplication

---

## 🚀 What's Left (Phase 3+)

### Monetization (Phase 3)
- [ ] Supabase project setup
- [ ] Stripe integration
- [ ] Subscription checking in extension
- [ ] Free tier limits (if any)

### Frontend Polish (Phase 4)
- [ ] Improve onboarding flow
- [ ] Better error messages
- [ ] Sync progress indicator
- [ ] Course selection during setup

### Cleanup (Phase 5)
- [ ] Remove debug console.logs
- [ ] Delete deprecated `api/` directory
- [ ] Comprehensive testing
- [ ] Chrome Web Store submission

---

## 📊 Testing Checklist

### Manual Test Flow
1. ✅ Fresh install - sign in with Google
2. ✅ Enter Canvas ICS URL
3. ✅ Create calendar
4. ✅ Sync - events/tasks created
5. ✅ Sign out - data preserved
6. ✅ Sign in again - continue with same data
7. ✅ Delete calendar in Google - sync recreates it
8. ✅ Exclude a course - sync deletes those events
9. ✅ Change date range - sync deletes out-of-range items

### Edge Cases to Test
- [ ] Token expiry during sync
- [ ] ICS feed temporarily unavailable
- [ ] Very large ICS feed (1000+ events)
- [ ] Sync interrupted by service worker termination
- [ ] Multiple rapid sync requests

---

## 🔗 Related Documentation

- `internal-documentation/migration-plan.md` - Original plan
- `internal-documentation/tech-debt-tracker.md` - Known issues
- `packages/google-api/README.md` - API client docs
- `packages/ics-parser/README.md` - Parser docs

---

## Conclusion

The core migration is complete. The extension now functions as a fully local-first application with no backend dependency for sync. The remaining work is primarily around monetization, polish, and edge case handling.

Key success factors:
1. Maintaining feature parity with the old server-based approach
2. Self-healing logic that handles external changes gracefully
3. Preference-aware sync that respects user configuration
4. Data persistence across sign-out/sign-in cycles
