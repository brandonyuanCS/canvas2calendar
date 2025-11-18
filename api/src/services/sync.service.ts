import * as CalendarService from './calendar.service.js';
import * as TaskListService from './taskList.service.js';
import { prisma } from '../lib/prisma.js';
import { ICSParser } from '../utils/ics-parser.js';
import { DEFAULT_PREFERENCES } from '@extension/shared';
import type { CanvasEvent, SyncPreferences, CentralSyncReport } from '@extension/shared';

/**
 * Detects changes in task preferences between two sync operations
 * @param oldPrefs - Preferences from the last sync (null if first sync)
 * @param newPrefs - Current preferences
 * @returns Object containing arrays of removed and added courses
 */
const detectTaskPreferenceChanges = (
  oldPrefs: SyncPreferences | null,
  newPrefs: SyncPreferences,
): {
  removedCourses: string[];
  addedCourses: string[];
} => {
  // If no old prefs (first sync), no courses to remove
  if (!oldPrefs) {
    return { removedCourses: [], addedCourses: [] };
  }

  // Simply use the arrays as-is (no normalization needed)
  const oldIncluded = oldPrefs.tasks.included_courses;
  const newIncluded = newPrefs.tasks.included_courses;

  const oldSet = new Set(oldIncluded);
  const newSet = new Set(newIncluded);

  const removedCourses = oldIncluded.filter(c => !newSet.has(c));
  const addedCourses = newIncluded.filter(c => !oldSet.has(c));

  return { removedCourses, addedCourses };
};

/**
 * Detects changes in calendar preferences between two sync operations
 * @param oldPrefs - Preferences from the last sync (null if first sync)
 * @param newPrefs - Current preferences
 * @returns Object containing arrays of removed and added courses
 */
const detectCalendarPreferenceChanges = (
  oldPrefs: SyncPreferences | null,
  newPrefs: SyncPreferences,
): {
  removedCourses: string[];
  addedCourses: string[];
} => {
  // If no old prefs (first sync), no courses to remove
  if (!oldPrefs) {
    return { removedCourses: [], addedCourses: [] };
  }

  // Simply use the arrays as-is (no normalization needed)
  const oldIncluded = oldPrefs.calendar.included_courses;
  const newIncluded = newPrefs.calendar.included_courses;

  const oldSet = new Set(oldIncluded);
  const newSet = new Set(newIncluded);

  const removedCourses = oldIncluded.filter(c => !newSet.has(c));
  const addedCourses = newIncluded.filter(c => !oldSet.has(c));

  return { removedCourses, addedCourses };
};

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

  // Load last synced preferences for change detection

  const lastSyncedPrefs = user.last_synced_preferences as unknown as SyncPreferences | null;

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
      // Events without a course code are always included
      const isIncluded = !courseCode || preferences.calendar.included_courses.includes(courseCode);

      if (isIncluded) {
        calendarEvents.push(event);
      }
    }

    // Check if event goes to tasks
    const goesToTasks = preferences.tasks.event_types.includes(eventType);
    if (goesToTasks) {
      // Apply tasks-specific course filters
      // Events without a course code are always included
      const isIncluded = !courseCode || preferences.tasks.included_courses.includes(courseCode);

      if (isIncluded) {
        taskEvents.push(event);
      }
    }
  }

  // Detect preference changes for both calendar and tasks
  const calendarPrefsChanges = detectCalendarPreferenceChanges(lastSyncedPrefs, preferences);
  const taskPrefsChanges = detectTaskPreferenceChanges(lastSyncedPrefs, preferences);

  // 5 & 6. Sync to respective services in parallel
  const [calendarReport, tasksReport] = await Promise.all([
    CalendarService.syncCalendarEvents(userId, calendarEvents, calendarPrefsChanges),
    TaskListService.syncTasks(userId, taskEvents, taskPrefsChanges),
  ]);

  // Update last_synced_preferences after successful sync
  await prisma.user.update({
    where: { id: userId },
    // @ts-expect-error - Prisma client needs regeneration after migration
    data: { last_synced_preferences: preferences },
  });

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
