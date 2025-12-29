# Canvas Metadata Endpoint

## Overview
The `/api/user/canvas-metadata` endpoint parses a user's Canvas ICS feed and returns discovered courses, event types, and date ranges. This is designed to populate the settings UI with actual data from the user's Canvas account.

## Endpoint Details

**URL**: `GET /api/user/canvas-metadata`  
**Auth**: Required (Bearer token)  
**Processing Time**: 2-5 seconds (parses entire ICS feed)

## Response Format

```json
{
  "success": true,
  "metadata": {
    "courses": [
      {
        "code": "CSCE331",
        "eventCount": 45,
        "eventTypes": ["lecture", "assignment", "quiz"]
      },
      {
        "code": "CSCE481",
        "eventCount": 12,
        "eventTypes": ["event", "lecture"]
      },
      {
        "code": "PERF301",
        "eventCount": 8,
        "eventTypes": ["assignment", "quiz"]
      }
    ],
    "eventTypes": {
      "lecture": 45,
      "assignment": 32,
      "quiz": 8,
      "discussion": 6,
      "event": 30
    },
    "dateRange": {
      "earliest": "2024-08-20T00:00:00.000Z",
      "latest": "2025-05-15T00:00:00.000Z"
    },
    "totalEvents": 121,
    "calendarName": "Canvas Calendar",
    "lastFetched": "2025-10-23T20:00:00.000Z"
  }
}
```

## Features

### 1. Course Discovery
- Automatically extracts all course codes from events
- Counts events per course
- Shows which event types exist in each course
- Sorted by event count (most events first), then alphabetically

### 2. Event Type Breakdown
- Shows total count for each event type across all courses
- Types: `lecture`, `assignment`, `quiz`, `discussion`, `event`

### 3. Date Range Analysis
- Finds the earliest event in the feed
- Finds the latest event in the feed
- Useful for setting default date range filters

### 4. Smart Error Handling
- Validates ICS URL is configured
- Provides specific error messages for fetch/parse failures
- Returns appropriate HTTP status codes

## Usage Example (curl)

```bash
# Get metadata for current user
curl -X GET http://localhost:3000/api/user/canvas-metadata \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Usage in Frontend

### React Example
```typescript
const fetchCanvasMetadata = async () => {
  setLoading(true);
  try {
    const response = await fetch('/api/user/canvas-metadata', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch metadata');
    }
    
    const data = await response.json();
    
    // Use metadata to populate settings UI
    setCourses(data.metadata.courses);
    setEventTypes(data.metadata.eventTypes);
    setDateRange(data.metadata.dateRange);
    
  } catch (error) {
    console.error('Failed to fetch Canvas metadata:', error);
    setError(error.message);
  } finally {
    setLoading(false);
  }
};
```

### Settings UI Integration
```tsx
// Show loading state while parsing
{loading && <Spinner text="Analyzing your Canvas calendar..." />}

// Display discovered courses as checkboxes
<h3>Select Courses to Sync</h3>
{courses.map(course => (
  <Checkbox
    key={course.code}
    label={`${course.code} (${course.eventCount} events)`}
    checked={selectedCourses.includes(course.code)}
    onChange={() => toggleCourse(course.code)}
  />
))}

// Display event types with counts
<h3>Event Types Found</h3>
<ul>
  {Object.entries(eventTypes).map(([type, count]) => (
    <li key={type}>{type}: {count} events</li>
  ))}
</ul>

// Show date range
<p>Your Canvas calendar spans from {dateRange.earliest} to {dateRange.latest}</p>
```

## Error Responses

### No ICS URL Configured
```json
{
  "error": "No ICS feed URL configured",
  "message": "Please set your Canvas ICS feed URL first"
}
```
**Status**: 400 Bad Request

### Failed to Fetch ICS Feed
```json
{
  "error": "Failed to fetch ICS feed",
  "message": "Could not connect to Canvas. Please check your ICS URL."
}
```
**Status**: 502 Bad Gateway

### Failed to Parse ICS Feed
```json
{
  "error": "Failed to parse ICS feed",
  "message": "The ICS feed format is invalid or corrupted."
}
```
**Status**: 400 Bad Request

## Performance Considerations

### Caching Strategy
This endpoint parses the entire ICS feed on every request. For better UX:

1. **Client-side caching**: Cache results for 1 hour
   ```typescript
   const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
   const cachedMetadata = localStorage.getItem('canvas_metadata');
   const cached = cachedMetadata ? JSON.parse(cachedMetadata) : null;
   
   if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
     return cached.data;
   }
   ```

2. **Server-side caching** (future enhancement):
   - Store metadata in Redis with 1-hour TTL
   - Invalidate on ICS URL change or manual sync

3. **Show loading indicators**: Parsing takes 2-5 seconds
   - Display progress message
   - Consider skeleton UI

## When to Call This Endpoint

### ✅ Call on:
- Settings page mount (if not cached)
- After user updates ICS URL
- When user clicks "Refresh" button
- After long periods (>1 hour since last call)

### ❌ Don't call on:
- Every settings page render
- Before/after sync operations (not needed)
- Popup open (too slow, cache on extension load)

## Integration with Preferences

After getting metadata, use it to populate preference defaults:

```typescript
const metadata = await fetchCanvasMetadata();

// Set default preferences based on discovered data
const defaultPreferences = {
  sync_rules: {
    calendar: {
      event_types: ['lecture', 'event'],
      included_courses: metadata.courses.map(c => c.code), // All courses
      excluded_courses: []
    },
    tasks: {
      event_types: ['assignment', 'quiz', 'discussion'],
      included_courses: metadata.courses.map(c => c.code), // All courses
      excluded_courses: []
    }
  },
  filters: {
    date_range: {
      past_days: 0,
      future_days: 365 // Based on metadata.dateRange if needed
    }
  }
};
```

## Future Enhancements

1. **Query parameter for refresh**: `?force_refresh=true` to bypass cache
2. **Partial parsing**: Only parse recent events for faster response
3. **Background job**: Pre-compute metadata after ICS URL changes
4. **Include course names**: Extract full course names from event summaries
5. **Color suggestions**: Auto-assign colors based on course hash

