import * as CalendarService from './calendar.service.js';
import * as TaskListService from './taskList.service.js';
import { prisma } from '../lib/prisma.js';
import { ICSParser } from '../utils/ics-parser.js';
import { DEFAULT_PREFERENCES } from '@extension/shared';
import type { CanvasEvent, SyncPreferences, CentralSyncReport, SyncReport, TaskSyncReport } from '@extension/shared';

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

  // Parse preferences with defaults (deep merge)
  const userPrefs = (user.preferences as unknown as Partial<SyncPreferences>) || {};
  const preferences: SyncPreferences = {
    sync: { ...DEFAULT_PREFERENCES.sync!, ...userPrefs.sync },
    calendar: { ...DEFAULT_PREFERENCES.calendar, ...userPrefs.calendar },
    tasks: { ...DEFAULT_PREFERENCES.tasks, ...userPrefs.tasks },
    data_management: {
      ...DEFAULT_PREFERENCES.data_management!,
      ...userPrefs.data_management,
    },
  };

  // 2. Fetch and parse ICS once
  const parser = new ICSParser();
  const parsedICS = await parser.fetchAndParse(feedUrl);

  // 3. Apply global date range filter
  let allEvents = parsedICS.events;

  if (preferences.data_management?.date_range) {
    const now = new Date();
    const { past_days, future_days } = preferences.data_management.date_range;

    const pastCutoff = past_days ? new Date(now.getTime() - past_days * 24 * 60 * 60 * 1000) : null;
    const futureCutoff = future_days ? new Date(now.getTime() + future_days * 24 * 60 * 60 * 1000) : null;

    allEvents = allEvents.filter(event => {
      if (pastCutoff && event.dtstart < pastCutoff) return false;
      if (futureCutoff && event.dtstart > futureCutoff) return false;
      return true;
    });
  }

  // 4. Split and filter events based on preferences
  const calendarEvents: CanvasEvent[] = [];
  const taskEvents: CanvasEvent[] = [];

  for (const event of allEvents) {
    const eventType = event.eventType; // Always set by ICS parser
    const courseCode = event.courseCode || '';

    // Check if event goes to calendar
    const goesToCalendar = preferences.calendar.event_types.includes(eventType);
    if (goesToCalendar) {
      // Apply calendar-specific course filters
      const isExcluded = preferences.calendar.excluded_courses.includes(courseCode);
      const isIncluded =
        preferences.calendar.included_courses.length === 0 || // Empty = all courses
        preferences.calendar.included_courses.includes(courseCode);

      if (!isExcluded && isIncluded) {
        calendarEvents.push(event);
      }
    }

    // Check if event goes to tasks
    const goesToTasks = preferences.tasks.event_types.includes(eventType);
    if (goesToTasks) {
      // Apply tasks-specific course filters
      const isExcluded = preferences.tasks.excluded_courses.includes(courseCode);
      const isIncluded =
        preferences.tasks.included_courses.length === 0 || // Empty = all courses
        preferences.tasks.included_courses.includes(courseCode);

      if (!isExcluded && isIncluded) {
        taskEvents.push(event);
      }
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
      filtered_out: parsedICS.events.length - allEvents.length,
      sync_started_at: syncStartTime,
      sync_completed_at: new Date(),
    },
  };
};

export { syncFromICS };
