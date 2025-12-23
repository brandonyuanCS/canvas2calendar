# Technical Debt & Future Improvements Tracker

> Last Updated: 2025-12-22

This document tracks known technical debt, incomplete features, and potential improvements identified during the migration from a centralized server architecture to a local-first Chrome Extension model.

---

## 🔴 High Priority

### 1. Preference-Based Event/Task Cleanup
**Location**: `chrome-extension/src/background/index.ts` → `runSync()`  
**Issue**: When a user removes a course from their preferences, the existing events/tasks for that course are not automatically deleted from Google Calendar/Tasks.  
**Original Behavior**: The backend `SyncService` had `prefsChanges` logic to detect added/removed courses and cascade deletions.  
**Fix**: Implement preference change detection by comparing `user.last_synced_preferences` with current preferences before sync, then delete orphaned items.

### 2. `last_synced_preferences` Not Being Updated  
**Location**: `chrome-extension/src/background/index.ts` → `runSync()`  
**Issue**: After a successful sync, `last_synced_preferences` should be updated to enable future preference change detection.  
**Fix**: Add `await userStorage.set({ ...user, last_synced_preferences: preferences })` after successful sync.

---

## 🟡 Medium Priority

### 3. 401 Token Expiration - No Automatic Retry
**Location**: `packages/google-api/lib/auth.ts` → `googleFetch()`  
**Issue**: When a 401 is received, the token is removed from cache, but the request is not retried. The user sees an error.  
**Improvement**: Implement a single retry after clearing the cached token:
```typescript
if (response.status === 401) {
  await removeCachedToken(token);
  // Retry once with fresh token
  return googleFetch(url, options);
}
```
**Risk**: Could cause infinite loop if not guarded. Add a `retried` flag.

### 4. Optional Permissions for Canvas Domains
**Location**: `chrome-extension/manifest.ts`  
**Current State**: Uses `<all_urls>` host_permissions which triggers a scary "read all data" warning.  
**Improvement**: Switch to `optional_host_permissions` and dynamically request access when the user enters their Canvas URL.  
**Reference**: See migration-plan.md § 2.3 for the intended approach.

### 5. Sync Resumption After Worker Termination
**Location**: `packages/storage/lib/impl/canvas-storage.ts` → `syncStateStorage`  
**Current State**: `SyncStateData` has `current_batch_index` and `pending_event_uids` fields, but resumption logic is not implemented.  
**Improvement**: On sync start, check if `is_syncing` is true with pending UIDs. If so, skip already-processed events.

### 6. Task Deletion When Events Disappear from ICS
**Location**: `chrome-extension/src/background/index.ts` → `syncTasks()`  
**Issue**: Unlike `syncCalendarEvents`, the `syncTasks` function does not delete tasks that are no longer in the incoming ICS feed.  
**Fix**: Add deletion logic similar to the calendar sync:
```typescript
for (const [icsUid, existing] of Object.entries(tasks)) {
  if (!incomingMap.has(icsUid) && icsUid.startsWith('event-')) {
    await TasksAPI.deleteTask(...);
    delete tasks[icsUid];
  }
}
```

---

## 🟢 Low Priority / Nice-to-Have

### 7. Self-Healing from Google Calendar ExtendedProperties
**Location**: `chrome-extension/src/background/index.ts`  
**Current State**: Not implemented.  
**Improvement**: If local storage is cleared but Google Calendar still has events with `extendedProperties.private.source === 'canvas2calendar'`, rebuild the local event map.  
**Trigger**: Could be a `REBUILD_STATE` message handler or automatic on first sync when storage is empty but calendar exists.

### 8. Rate Limiting / Backoff for Google API
**Location**: `packages/google-api/lib/auth.ts`  
**Issue**: No handling for 429 (Too Many Requests) or 503 (Service Unavailable).  
**Improvement**: Add exponential backoff retry logic for transient errors.

### 9. Notification on Sync Completion/Failure
**Location**: `chrome-extension/src/background/index.ts`  
**Current State**: Sync results are only logged to console.  
**Improvement**: Use `chrome.notifications.create()` to inform users of sync status, especially on errors.

### 10. Deep Merge for Preferences Update
**Location**: `chrome-extension/src/background/index.ts` → `UPDATE_PREFERENCES` handler  
**Issue**: Current implementation uses shallow spread. Nested preference objects (like `calendar.included_courses`) may be overwritten entirely.  
**Fix**: Use a deep merge utility (e.g., `deepmerge` package already in devDependencies).

---

## ⬜ Not Started (Per Migration Plan)

| Item | Notes |
|------|-------|
| **Frontend Migration** | Move from sidepanel to content-injected modal/popup |
| **End-to-End Testing** | Test complete sync flow with real Canvas/Google accounts |
| **Monetization Backend** | Lightweight subscription check API |

---

## 📝 Notes

- The lint error `File '@extension/tsconfig/base.json' not found` is a false positive. The file exists at `packages/tsconfig/base.json`. This resolves after `pnpm install` or IDE restart.
- The `ical.js` library works in the Service Worker environment without issues.
- All individual packages (`shared`, `storage`, `google-api`, `ics-parser`) build successfully in isolation.
