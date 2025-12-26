# User Preferences Refactoring

## Overview
Refactored the `SyncPreferences` interface to better align with the settings UI structure and provide more granular control over sync behavior.

## What Changed

### ❌ Old Structure (Removed)
```typescript
interface SyncPreferences {
  sync_rules: {
    calendar: CanvasEventType[];
    tasks: CanvasEventType[];
  };
  filters?: {
    excluded_courses?: string[];
    included_courses?: string[];
    date_range?: { past_days?: number; future_days?: number };
  };
  auto_sync?: {
    enabled: boolean;
    interval_hours: number;
  };
}
```

### ✅ New Structure (Current)
```typescript
interface SyncPreferences {
  sync?: {
    auto_sync_enabled: boolean;
    auto_sync_interval_hours: number;
    sync_on_startup: boolean;
    initial_sync_past_days: number;
  };
  
  calendar: {
    event_types: CanvasEventType[];
    included_courses: string[];  // Empty = all courses
    excluded_courses: string[];
    color_coding_enabled: boolean;
    course_colors: Record<string, string>;
    default_calendar_id?: string;
  };
  
  tasks: {
    event_types: CanvasEventType[];
    included_courses: string[];  // Empty = all courses
    excluded_courses: string[];
    task_list_naming: 'code' | 'name' | 'combined';
    task_organization: 'per_course' | 'consolidated';
  };
  
  data_management?: {
    date_range: {
      past_days: number;
      future_days: number;
    };
    auto_archive_completed_tasks: boolean;
    auto_archive_days?: number;
  };
}
```

## Key Improvements

### 1. **Separate Course Filters per Destination**
**Before**: One global course filter affected both calendar and tasks
```typescript
filters: {
  included_courses: ['CSCE331', 'CSCE481']  // Applied to BOTH
}
```

**After**: Independent course filtering
```typescript
calendar: {
  included_courses: ['CSCE331', 'CSCE481', 'PERF301']
},
tasks: {
  included_courses: ['CSCE331']  // Only CSCE331 tasks
}
```

**Benefit**: Users can sync calendar events from all courses but only create tasks for specific courses.

### 2. **Organized by Settings Category**
Aligns with the UI structure:
- `sync` → Automation settings
- `calendar` → Calendar-specific settings
- `tasks` → Tasks-specific settings
- `data_management` → Data filtering and archival

### 3. **New Features Added**

#### Sync Automation
- `sync_on_startup` - Auto-sync when browser starts
- `initial_sync_past_days` - How far back to sync on first run

#### Calendar Customization
- `color_coding_enabled` - Toggle color coding per course
- `course_colors` - Custom color per course code
- `default_calendar_id` - Which Google Calendar to use

#### Tasks Organization
- `task_list_naming` - How to name task lists (`'code'`, `'name'`, `'combined'`)
- `task_organization` - Group by course or consolidate into one list

#### Data Management
- `auto_archive_completed_tasks` - Clean up old completed tasks
- `auto_archive_days` - How old before archiving

### 4. **Clearer Defaults**
```typescript
export const DEFAULT_PREFERENCES: SyncPreferences = {
  sync: {
    auto_sync_enabled: false,
    auto_sync_interval_hours: 6,
    sync_on_startup: false,
    initial_sync_past_days: 0,
  },
  calendar: {
    event_types: ['lecture', 'event'],
    included_courses: [],  // Empty = all courses
    excluded_courses: [],
    color_coding_enabled: false,
    course_colors: {},
  },
  tasks: {
    event_types: ['assignment', 'quiz', 'discussion'],
    included_courses: [],  // Empty = all courses
    excluded_courses: [],
    task_list_naming: 'code',
    task_organization: 'per_course',
  },
  data_management: {
    date_range: {
      past_days: 0,       // No past events
      future_days: 365,   // One year ahead
    },
    auto_archive_completed_tasks: false,
    auto_archive_days: 30,
  },
};
```

## Migration Guide

### For Frontend Developers

#### Old Way (Deprecated)
```typescript
const preferences = {
  sync_rules: {
    calendar: ['lecture', 'event'],
    tasks: ['assignment', 'quiz']
  },
  filters: {
    included_courses: ['CSCE331'],
    excluded_courses: [],
    date_range: { past_days: 0, future_days: 365 }
  }
};
```

#### New Way
```typescript
const preferences = {
  calendar: {
    event_types: ['lecture', 'event'],
    included_courses: ['CSCE331'],
    excluded_courses: [],
    color_coding_enabled: false,
    course_colors: {},
  },
  tasks: {
    event_types: ['assignment', 'quiz'],
    included_courses: ['CSCE331'],
    excluded_courses: [],
    task_list_naming: 'code',
    task_organization: 'per_course',
  },
  data_management: {
    date_range: { past_days: 0, future_days: 365 },
    auto_archive_completed_tasks: false,
  }
};
```

### Example: Different Course Filters
```typescript
const preferences = {
  calendar: {
    event_types: ['lecture', 'event'],
    included_courses: [],  // All courses in calendar
    excluded_courses: ['GYM101'],  // Except gym class
  },
  tasks: {
    event_types: ['assignment', 'quiz'],
    included_courses: ['CSCE331', 'CSCE481'],  // Only major classes
    excluded_courses: [],
  }
};
```

## Backend Changes

### Files Modified

#### 1. `types/preferences.ts`
- Completely redesigned `SyncPreferences` interface
- Added new type aliases: `CanvasEventType`, `TaskListNaming`, `TaskOrganization`
- Updated `DEFAULT_PREFERENCES` to match new structure

#### 2. `services/sync.service.ts`
- Updated preference parsing with deep merge
- **Improved filtering logic**: Now applies course filters separately for calendar vs tasks
- Changed date range source: `filters.date_range` → `data_management.date_range`
- Changed event routing: `sync_rules.calendar/tasks` → `calendar/tasks.event_types`

**New Logic Flow**:
```typescript
// 1. Apply global date range filter
allEvents = filterByDateRange(allEvents, preferences.data_management.date_range);

// 2. Split events by type and apply SEPARATE course filters
for (const event of allEvents) {
  // Calendar
  if (preferences.calendar.event_types.includes(event.eventType)) {
    if (shouldIncludeCourse(event.courseCode, preferences.calendar)) {
      calendarEvents.push(event);
    }
  }
  
  // Tasks
  if (preferences.tasks.event_types.includes(event.eventType)) {
    if (shouldIncludeCourse(event.courseCode, preferences.tasks)) {
      taskEvents.push(event);
    }
  }
}
```

#### 3. `routes/user.ts`
- Updated validation in `PUT /api/user/preferences`
- Now validates: `calendar` and `tasks` objects (required)
- Validates all array fields: `event_types`, `included_courses`, `excluded_courses`

#### 4. `types/index.ts`
- Added exports for new types: `CanvasEventType`, `TaskListNaming`, `TaskOrganization`

## API Examples

### Get Preferences (Returns Defaults if Unset)
```bash
curl -X GET http://localhost:3000/api/user/preferences \
  -H "Authorization: Bearer TOKEN"
```

Response:
```json
{
  "success": true,
  "preferences": {
    "sync": {
      "auto_sync_enabled": false,
      "auto_sync_interval_hours": 6,
      "sync_on_startup": false,
      "initial_sync_past_days": 0
    },
    "calendar": {
      "event_types": ["lecture", "event"],
      "included_courses": [],
      "excluded_courses": [],
      "color_coding_enabled": false,
      "course_colors": {}
    },
    "tasks": {
      "event_types": ["assignment", "quiz", "discussion"],
      "included_courses": [],
      "excluded_courses": [],
      "task_list_naming": "code",
      "task_organization": "per_course"
    },
    "data_management": {
      "date_range": { "past_days": 0, "future_days": 365 },
      "auto_archive_completed_tasks": false,
      "auto_archive_days": 30
    }
  }
}
```

### Update Preferences
```bash
curl -X PUT http://localhost:3000/api/user/preferences \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "preferences": {
      "calendar": {
        "event_types": ["lecture", "event", "quiz"],
        "included_courses": [],
        "excluded_courses": ["GYM101"],
        "color_coding_enabled": true,
        "course_colors": {
          "CSCE331": "#FF5733",
          "CSCE481": "#33C4FF"
        }
      },
      "tasks": {
        "event_types": ["assignment", "quiz"],
        "included_courses": ["CSCE331", "CSCE481"],
        "excluded_courses": [],
        "task_list_naming": "combined",
        "task_organization": "per_course"
      },
      "sync": {
        "auto_sync_enabled": true,
        "auto_sync_interval_hours": 12,
        "sync_on_startup": true,
        "initial_sync_past_days": 7
      },
      "data_management": {
        "date_range": { "past_days": 0, "future_days": 180 },
        "auto_archive_completed_tasks": true,
        "auto_archive_days": 14
      }
    }
  }'
```

## Breaking Changes

### ⚠️ For Existing Users
- **Old preferences format is incompatible**
- Users with existing preferences will fall back to defaults
- **Recommendation**: Clear all user preferences in database or migrate them

### Migration SQL (Optional)
```sql
-- Reset all user preferences to null (will use defaults)
UPDATE "user" SET preferences = NULL;

-- Or migrate existing preferences (complex, case-by-case basis)
```

## Testing Checklist

- [x] Preferences default to correct values
- [x] Course filters work independently for calendar vs tasks
- [x] Date range filtering applies globally
- [x] Event type routing works correctly
- [x] Validation rejects malformed preferences
- [ ] Frontend settings UI matches new structure
- [ ] Auto-sync respects new `sync` settings (when implemented)
- [ ] Color coding applies correctly (when implemented)
- [ ] Task list naming works as expected (when implemented)

## Future Enhancements

### Not Yet Implemented (Placeholders)
These fields exist in preferences but are not yet used:

1. **`sync.sync_on_startup`** - Needs background script
2. **`sync.initial_sync_past_days`** - Needs first-run detection
3. **`calendar.color_coding_enabled`** - Needs Google Calendar API color support
4. **`calendar.course_colors`** - Needs color application in sync
5. **`calendar.default_calendar_id`** - Needs multi-calendar support
6. **`tasks.task_list_naming`** - Currently hardcoded to course code
7. **`tasks.task_organization`** - Only `per_course` implemented
8. **`data_management.auto_archive_completed_tasks`** - Needs cleanup job

### Roadmap
- **Phase 1**: Settings UI to manage all preferences ✅ (structure ready)
- **Phase 2**: Implement auto-sync automation
- **Phase 3**: Implement color coding
- **Phase 4**: Implement task organization options
- **Phase 5**: Implement auto-archive

## Summary

✅ **What's Working**:
- Event type routing (calendar vs tasks)
- Course filtering (separate for calendar & tasks)
- Date range filtering
- Preference storage and retrieval

🚧 **What's Ready But Not Used**:
- Auto-sync settings
- Color coding
- Task list naming options
- Auto-archive settings

📝 **What's Next**:
- Build settings UI in extension
- Implement auto-sync background job
- Add color coding to sync logic
- Add task list naming customization

---

**Status**: ✅ Backend refactoring complete, ready for frontend integration!

