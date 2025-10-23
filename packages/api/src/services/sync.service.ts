import * as CalendarService from './calendar.service.js';
import * as TaskListService from './taskList.service.js';
import { prisma } from '../lib/prisma.js';
import { ICSParser } from '../utils/ics-parser.js';
import type { SyncReport } from './calendar.service.js';
import type { TaskSyncReport } from './taskList.service.js';
import type { CanvasEvent } from '../utils/ics-parser.js';

// User preferences types
interface SyncPreferences {
  sync_rules: {
    calendar: ('lecture' | 'event' | 'quiz' | 'discussion' | 'assignment')[];
    tasks: ('lecture' | 'event' | 'quiz' | 'discussion' | 'assignment')[];
  };
  filters?: {
    excluded_courses?: string[];
    included_courses?: string[];
    date_range?: {
      past_days?: number;
      future_days?: number;
    };
  };
  auto_sync?: {
    enabled: boolean;
    interval_hours: number;
  };
}

interface CentralSyncReport {
  calendar: SyncReport;
  tasks: TaskSyncReport;
  metadata: {
    total_events_parsed: number;
    events_to_calendar: number;
    events_to_tasks: number;
    filtered_out: number;
    sync_started_at: Date;
    sync_completed_at: Date;
  };
}

// Default preferences for new users
const DEFAULT_PREFERENCES: SyncPreferences = {
  sync_rules: {
    calendar: ['lecture', 'event'],
    tasks: ['assignment', 'quiz', 'discussion'],
  },
};

// Helper to create empty reports
const createEmptySyncReport = (): SyncReport => ({
  created: [],
  updated: [],
  deleted: [],
  unchanged: [],
  errors: [],
});

const createEmptyTaskSyncReport = (): TaskSyncReport => ({
  taskLists: {
    created: [],
    existing: [],
  },
  tasks: {
    created: [],
    updated: [],
    deleted: [],
    unchanged: [],
  },
  errors: [],
});

// Central sync orchestration
const syncFromICS = async (userId: number, icsUrl?: string): Promise<CentralSyncReport> => {
  const syncStartTime = new Date();

  // 1. Get user and preferences
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const feedUrl = icsUrl || user.canvas_ics_feed_url;
  if (!feedUrl) {
    throw new Error('No ICS feed URL provided or stored for this user');
  }

  // Parse preferences with defaults
  const preferences: SyncPreferences = {
    ...DEFAULT_PREFERENCES,
    ...((user.preferences as unknown as SyncPreferences) || {}),
  };

  // 2. Fetch and parse ICS once
  const parser = new ICSParser();
  const parsedICS = await parser.fetchAndParse(feedUrl);

  // 3. Apply filters
  let filteredEvents = parsedICS.events;

  // Filter by date range
  if (preferences.filters?.date_range) {
    const now = new Date();
    const pastCutoff = preferences.filters.date_range.past_days
      ? new Date(now.getTime() - preferences.filters.date_range.past_days * 24 * 60 * 60 * 1000)
      : null;
    const futureCutoff = preferences.filters.date_range.future_days
      ? new Date(now.getTime() + preferences.filters.date_range.future_days * 24 * 60 * 60 * 1000)
      : null;

    filteredEvents = filteredEvents.filter(event => {
      if (pastCutoff && event.dtstart < pastCutoff) return false;
      if (futureCutoff && event.dtstart > futureCutoff) return false;
      return true;
    });
  }

  // Filter by course inclusion/exclusion
  if (preferences.filters?.excluded_courses && preferences.filters.excluded_courses.length > 0) {
    filteredEvents = filteredEvents.filter(
      event => !preferences.filters!.excluded_courses!.includes(event.courseCode || ''),
    );
  }

  if (preferences.filters?.included_courses && preferences.filters.included_courses.length > 0) {
    filteredEvents = filteredEvents.filter(event =>
      preferences.filters!.included_courses!.includes(event.courseCode || ''),
    );
  }

  // 4. Split events based on sync_rules
  const calendarEvents: CanvasEvent[] = [];
  const taskEvents: CanvasEvent[] = [];

  for (const event of filteredEvents) {
    const eventType = event.eventType || 'event';

    const goesToCalendar = preferences.sync_rules.calendar.includes(eventType);
    const goesToTasks = preferences.sync_rules.tasks.includes(eventType);

    // Event can go to both, one, or neither
    if (goesToCalendar) {
      calendarEvents.push(event);
    }
    if (goesToTasks) {
      taskEvents.push(event);
    }
  }

  // 5 & 6. Sync to respective services in parallel
  const [calendarReport, tasksReport] = await Promise.all([
    calendarEvents.length > 0
      ? CalendarService.syncCalendarEvents(userId, calendarEvents)
      : Promise.resolve(createEmptySyncReport()),
    taskEvents.length > 0
      ? TaskListService.syncTasks(userId, taskEvents)
      : Promise.resolve(createEmptyTaskSyncReport()),
  ]);

  // 7. Combine reports
  return {
    calendar: calendarReport,
    tasks: tasksReport,
    metadata: {
      total_events_parsed: parsedICS.events.length,
      events_to_calendar: calendarEvents.length,
      events_to_tasks: taskEvents.length,
      filtered_out: parsedICS.events.length - filteredEvents.length,
      sync_started_at: syncStartTime,
      sync_completed_at: new Date(),
    },
  };
};

export { syncFromICS, DEFAULT_PREFERENCES };
export type { SyncPreferences, CentralSyncReport };
