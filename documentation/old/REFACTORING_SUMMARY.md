# Backend Refactoring Summary - Central Sync System

**Date**: October 23, 2024  
**Status**: ✅ Core implementation complete, ready for production testing

---

## Overview

Successfully refactored the Express.js backend from multiple CRUD endpoints to a centralized ICS sync system. The backend now handles all decision-making logic for syncing Canvas calendar events to Google Calendar and Google Tasks.

---

## Changes Implemented Today

### 1. Database Schema Updates
**File**: `packages/api/prisma/schema.prisma`

- ✅ Added `canvas_ics_feed_url` field to `user` model
- ✅ Migration created: `20251023022410_added_ics_link`
- ⚠️ **Action Required**: Run `npx prisma generate` after pulling changes

### 2. Core Services Created/Modified

#### New: Central Sync Service
**File**: `packages/api/src/services/sync.service.ts`

- Central orchestration for all sync operations
- Parses ICS feed once, routes events based on user preferences
- Supports filtering by date range and course inclusion/exclusion
- Runs calendar and task syncs in parallel for performance

**Key Features:**
- Default preferences (calendar: lectures/events, tasks: assignments/quizzes/discussions)
- User-customizable sync rules
- Detailed reporting with metadata

#### Modified: Calendar Service
**File**: `packages/api/src/services/calendar.service.ts`

- ✅ Refactored `syncCalendarEvents()` to accept pre-parsed event array
- ✅ Kept `syncCalendarFromICS()` for backward compatibility
- ✅ **IMPORTANT**: Only deletes Canvas-synced events (preserves user-created events)
  - Check: `icsUid.startsWith('event-')`

#### Modified: Task List Service
**File**: `packages/api/src/services/taskList.service.ts`

- ✅ Created `syncTasks()` function for intelligent task sync
- ✅ Auto-creates task lists per course code
- ✅ Groups tasks by course automatically
- ✅ Updated `createTask()` to accept optional `ics_uid` parameter
- ✅ **IMPORTANT**: Only deletes Canvas-synced tasks (preserves user-created tasks)
  - Check: `icsUid.startsWith('event-')`

### 3. Utilities Created/Modified

#### ICS Parser
**File**: `packages/api/src/utils/ics-parser.ts`

- ✅ Enhanced course code extraction to handle Canvas bracket format
- Supports both patterns:
  - `"CSCE 331 - Assignment"` (original)
  - `"Assignment [CSCE-331:916,970]"` (Canvas format)

#### Hash Utility
**File**: `packages/api/src/utils/hash.util.ts`

- Event hash generation for change detection
- Uses SHA-256 on: uid, summary, dtstart, dtend, description, location

### 4. API Routes

#### New: Central Sync Endpoint
**File**: `packages/api/src/routes/sync.ts`

- `POST /api/sync` - Master sync endpoint
- Returns combined calendar + task reports
- Includes sync metadata (timing, counts)

#### New: User Preferences Management
**File**: `packages/api/src/routes/user.ts`

- `GET /api/user/ics-url` - Get Canvas ICS feed URL
- `PUT /api/user/ics-url` - Set/update Canvas ICS feed URL
- `DELETE /api/user/ics-url` - Remove ICS feed URL
- `GET /api/user/preferences` - Get sync preferences
- `PUT /api/user/preferences` - Update sync preferences

#### Updated: Route Index
**File**: `packages/api/src/routes/index.ts`

- Registered `/sync` routes
- Registered `/user` routes

---

## How It Works Now

### Sync Flow
```
1. User stores Canvas ICS URL → Database
2. POST /api/sync
3. Backend fetches ICS feed
4. Backend parses events
5. Backend applies user preferences & filters
6. Backend splits: lectures → Calendar, assignments → Tasks
7. Backend syncs to Google (parallel execution)
8. Returns detailed report
```

### Event Routing (Default)
- **→ Google Calendar**: `lecture`, `event`
- **→ Google Tasks**: `assignment`, `quiz`, `discussion`

### Task Organization
- Tasks automatically grouped by course code into separate lists
- Example: CSCE331 tasks → "CSCE331" list

### User-Created Content Protection
- ✅ Manual events with `ics_uid = "canvas2cal-{uuid}"` → **PRESERVED**
- ✅ Manual tasks with `ics_uid = "unknown"` → **PRESERVED**
- ❌ Canvas events with `ics_uid = "event-*"` → **DELETED** if removed from Canvas

---

## Known Issues & Limitations

### 1. Task Ordering (Documented, Not a Bug)
**Issue**: Tasks appear in insertion order, not chronological order by default

**Solution**: User should enable "Sort by due date" in Google Tasks UI
- This is standard behavior for all task managers
- No code changes needed
- Works perfectly for both synced and manual tasks

**Future Enhancement**: Could implement server-side ordering using `previous` parameter, but adds API overhead

---

## Future Work

### Phase 1: API Cleanup (High Priority)
- [ ] **Mark old CRUD endpoints as deprecated**
  - `POST /api/calendar/sync` → Redirect to `/api/sync`
  - Document that `/api/sync` is the primary endpoint
- [ ] **Consider removing individual CRUD endpoints** (after frontend migration)
  - `POST /api/calendar/event`
  - `PATCH /api/calendar/event/:id`
  - `DELETE /api/calendar/event/:id`
  - Similar for task endpoints
- [ ] **Keep only**:
  - `GET /api/calendar` - Get calendar info
  - `GET /api/calendar/event` - List events (for debugging)
  - `POST /api/sync` - Main sync operation

### Phase 2: User Preferences Enhancements
- [ ] Add default date range filtering
  - Suggestion: `past_days: 0`, `future_days: 60`
  - Prevents long task lists
- [ ] Add `auto_archive` completed tasks feature
- [ ] Add task organization preference: `by_course` | `by_time` | `by_priority`
- [ ] Add UI in extension for preference management

### Phase 3: Advanced Features
- [ ] **Background Auto-Sync**
  - Scheduled job based on `auto_sync.interval_hours`
  - User preference to enable/disable
- [ ] **Sync History/Audit Log**
  - Track when syncs run
  - Show what changed each sync
  - Rollback capability
- [ ] **Webhook Support**
  - Real-time sync when Canvas updates
  - Reduces need for polling
- [ ] **Conflict Resolution**
  - Handle cases where user modifies synced event
  - UI to review/resolve conflicts
- [ ] **Multi-Calendar Support**
  - Remove MVP constraint of single calendar
  - Let users choose different calendars per course

### Phase 4: Performance Optimizations
- [ ] Cache ICS feed (with TTL)
- [ ] Batch Google API operations
- [ ] Implement retry logic with exponential backoff
- [ ] Rate limiting on sync endpoint

### Phase 5: UX Improvements
- [ ] First-time onboarding flow
  - Guide to enable "Sort by due date" in Google Tasks
  - Explain sync preferences
- [ ] Sync status indicators
  - Last sync time
  - Next scheduled sync
  - Progress during sync
- [ ] Browser extension updates
  - One-click sync button
  - Preference UI
  - Visual feedback

---

## Breaking Changes

### For Frontend/Extension
1. **Primary sync endpoint changed**: Use `POST /api/sync` instead of multiple calls
2. **User preferences required**: Add UI for managing sync preferences
3. **ICS URL storage**: Add UI to set Canvas ICS URL

### Migration Path
1. Update frontend to use new `/api/sync` endpoint
2. Add user preferences UI
3. Test thoroughly
4. Deprecate old endpoints in documentation
5. After 1-2 releases, remove old endpoints

---

## Dependencies Added
- `ical.js` - ICS parsing (already in ics-parsing package, now in API too)

## Files Created (5 new files)
1. `packages/api/src/services/sync.service.ts`
2. `packages/api/src/routes/sync.ts`
3. `packages/api/src/routes/user.ts`
4. `packages/api/src/utils/hash.util.ts`
5. `packages/api/src/utils/ics-parser.ts`

## Files Modified (6 files)
1. `packages/api/prisma/schema.prisma`
2. `packages/api/src/services/calendar.service.ts`
3. `packages/api/src/services/taskList.service.ts`
4. `packages/api/src/routes/calendar.ts`
5. `packages/api/src/routes/index.ts`
6. `packages/api/package.json` (dependencies)

---

## Production Readiness

### ✅ Ready for Production
- Core sync functionality
- User preferences management
- Event/task preservation logic
- Error handling and reporting

### ⚠️ Before Production Deploy
1. Run database migration
2. Regenerate Prisma client
3. Update frontend to use new endpoints
4. Add user onboarding for "Sort by due date" instruction

### 🔄 Post-Launch Monitoring
- Watch for sync errors in logs
- Monitor API rate limits (Google Calendar/Tasks)
- Track sync performance (should be <15 seconds)
- Collect user feedback on task organization

---

## Success Metrics

### Achieved Today ✅
- Single API call for full sync (was: dozens of calls)
- Automatic task organization by course (was: manual)
- Smart event routing (was: client-side decision)
- User-created content preserved (was: potential data loss)
- Detailed sync reporting (was: minimal feedback)

### Target Metrics (Post-Launch)
- Sync completion time: <15 seconds for 100 events
- User satisfaction with task organization: >80%
- Reduction in support tickets about "lost events": 100%
- API calls per sync: 2-5 (was: 50+)

---

**Last Updated**: October 23, 2024  
**Status**: Ready for testing and frontend integration

