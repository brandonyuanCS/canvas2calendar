/**
 * Canvas2Calendar Background Service Worker
 *
 * Main entry point for the Chrome Extension background script.
 * Handles:
 * - OAuth authentication via chrome.identity
 * - Periodic sync via chrome.alarms
 * - Message passing from popup/content scripts
 */

import 'webextension-polyfill';
import { generateEventHash } from './utils/hash.js';
import {
  getAuthToken,
  getUserInfo,
  CalendarAPI,
  TasksAPI,
  clearAllCachedTokens,
  GoogleApiException,
} from '@extension/google-api';
import { icsParser, validateCanvasUrl } from '@extension/ics-parser';
import { DEFAULT_PREFERENCES } from '@extension/shared';
import {
  userStorage,
  calendarStorage,
  syncStateStorage,
  eventsStorage,
  taskListsStorage,
  tasksStorage,
  clearAllCanvas2CalData,
} from '@extension/storage';
import type { CanvasEvent, SyncPreferences, SyncReport, TaskSyncReport } from '@extension/shared';
import type { CalendarDataState } from '@extension/storage';

// ============= Constants =============

const ALARM_NAME = 'canvas2calendar-sync';
const DEFAULT_SYNC_INTERVAL_MINUTES = 360; // 6 hours

// ============= Initialization =============

console.log('[Canvas2Calendar] Background service worker loaded');

// Set up alarm on install
chrome.runtime.onInstalled.addListener(async details => {
  console.log(`[Canvas2Calendar] Extension ${details.reason}:`, details);

  if (details.reason === 'install') {
    await setupSyncAlarm(DEFAULT_SYNC_INTERVAL_MINUTES);
  }
});

// ============= Alarm Handler =============

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== ALARM_NAME) return;

  console.log('[Canvas2Calendar] Sync alarm triggered');

  try {
    const user = await userStorage.get();
    if (!user?.canvas_ics_feed_url) {
      console.log('[Canvas2Calendar] No ICS URL configured, skipping sync');
      return;
    }

    if (!user.preferences?.sync?.auto_sync_enabled) {
      console.log('[Canvas2Calendar] Auto-sync disabled, skipping');
      return;
    }

    await runSync();
  } catch (error) {
    console.error('[Canvas2Calendar] Sync failed:', error);
  }
});

const setupSyncAlarm = async (intervalMinutes: number): Promise<void> => {
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: intervalMinutes,
    delayInMinutes: 1,
  });
};

// ============= Message Handler =============

chrome.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch(error => {
      console.error('[Canvas2Calendar] Message handler error:', error);
      sendResponse({ success: false, error: error.message || 'Unknown error' });
    });

  return true; // Async response
});

const handleMessage = async (message: BackgroundMessage): Promise<BackgroundResponse> => {
  switch (message.type) {
    case 'SIGN_IN': {
      try {
        await getAuthToken(true);
        const userInfo = await getUserInfo();

        const now = new Date().toISOString();

        // Get existing user data to merge (preserves ICS URL, preferences, etc.)
        const existingUser = await userStorage.get();

        await userStorage.set({
          // Preserve existing data
          ...existingUser,
          // Update with new auth info
          google_user_id: userInfo.id,
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture,
          // Only set defaults if not already set
          preferences: existingUser?.preferences || DEFAULT_PREFERENCES,
          created_at: existingUser?.created_at || now,
          updated_at: now,
        });

        return { success: true, data: { email: userInfo.email, name: userInfo.name } };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Sign in failed' };
      }
    }

    case 'SIGN_OUT': {
      // Only clear auth-related tokens, preserve calendar/tasks/ICS URL
      // This allows users to re-sign in and continue with their existing setup
      await clearAllCachedTokens();
      await chrome.alarms.clear(ALARM_NAME);

      // Clear the google_user_id but preserve other user data (ICS URL, preferences)
      const existingUser = await userStorage.get();
      if (existingUser) {
        await userStorage.set({
          ...existingUser,
          google_user_id: '', // Mark as not authenticated
          updated_at: new Date().toISOString(),
        });
      }

      return { success: true, data: null };
    }

    case 'SYNC_NOW': {
      try {
        const report = await runSync(message.icsUrl);
        return { success: true, data: report };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Sync failed' };
      }
    }

    case 'GET_STATUS': {
      const [user, calendar, syncState] = await Promise.all([
        userStorage.get(),
        calendarStorage.get(),
        syncStateStorage.get(),
      ]);

      return {
        success: true,
        data: {
          isAuthenticated: !!user?.google_user_id,
          hasCalendar: !!calendar?.google_calendar_id,
          hasIcsUrl: !!user?.canvas_ics_feed_url,
          ...syncState,
        },
      };
    }

    case 'GET_USER': {
      const user = await userStorage.get();
      return { success: true, data: user };
    }

    case 'SET_ICS_URL': {
      const validation = validateCanvasUrl(message.url);
      if (!validation.isValid) {
        return { success: false, error: validation.error || 'Invalid URL' };
      }

      const user = await userStorage.get();
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      await userStorage.set({
        ...user,
        canvas_ics_feed_url: message.url,
        updated_at: new Date().toISOString(),
      });

      return { success: true, data: { url: message.url } };
    }

    case 'CREATE_CALENDAR': {
      try {
        const existingCalendar = await calendarStorage.get();
        if (existingCalendar) {
          return { success: false, error: 'Calendar already exists' };
        }

        const googleCalendar = await CalendarAPI.createCalendar({
          summary: message.name.trim(),
          description: message.description?.trim() || 'Created by canvas2calendar',
        });

        if (!googleCalendar.id) {
          return { success: false, error: 'Failed to create calendar' };
        }

        const calendarData: CalendarDataState = {
          google_calendar_id: googleCalendar.id,
          title: googleCalendar.summary || 'Canvas Calendar',
          created_at: new Date().toISOString(),
        };

        await calendarStorage.set(calendarData);
        return { success: true, data: calendarData };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to create calendar' };
      }
    }

    case 'RESET_ALL': {
      try {
        // Delete from Google first
        const calendar = await calendarStorage.get();
        if (calendar) {
          try {
            await CalendarAPI.deleteCalendar(calendar.google_calendar_id);
          } catch {
            // Ignore if already deleted
          }
        }

        const taskLists = await taskListsStorage.get();
        for (const taskList of Object.values(taskLists)) {
          try {
            await TasksAPI.deleteTaskList(taskList.google_task_list_id);
          } catch {
            // Ignore if already deleted
          }
        }

        await clearAllCanvas2CalData();
        return { success: true, data: { message: 'All data cleared' } };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Reset failed' };
      }
    }

    case 'UPDATE_PREFERENCES': {
      try {
        const user = await userStorage.get();
        if (!user) {
          return { success: false, error: 'User not found' };
        }

        const updatedPreferences = {
          ...user.preferences,
          ...message.preferences,
        };

        await userStorage.set({
          ...user,
          preferences: updatedPreferences,
          updated_at: new Date().toISOString(),
        });

        return { success: true, data: updatedPreferences };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to update preferences' };
      }
    }

    case 'GET_CANVAS_METADATA': {
      try {
        const user = await userStorage.get();
        if (!user?.canvas_ics_feed_url) {
          return { success: false, error: 'No ICS URL configured' };
        }

        const parsedICS = await icsParser.fetchAndParse(user.canvas_ics_feed_url);

        // Extract course codes and event counts
        const courseMap = new Map<string, { eventCount: number; eventTypes: Set<string> }>();
        const eventTypeCounts: Record<string, number> = {};

        for (const event of parsedICS.events) {
          const courseCode = event.courseCode || 'Unknown';

          if (!courseMap.has(courseCode)) {
            courseMap.set(courseCode, { eventCount: 0, eventTypes: new Set() });
          }

          const course = courseMap.get(courseCode)!;
          course.eventCount++;
          course.eventTypes.add(event.eventType);

          eventTypeCounts[event.eventType] = (eventTypeCounts[event.eventType] || 0) + 1;
        }

        const courses = Array.from(courseMap.entries()).map(([code, data]) => ({
          code,
          eventCount: data.eventCount,
          eventTypes: Array.from(data.eventTypes),
        }));

        // Find date range
        const dates = parsedICS.events.map(e => e.dtstart.getTime());
        const earliest = dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : '';
        const latest = dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : '';

        return {
          success: true,
          data: {
            courses,
            eventTypes: eventTypeCounts,
            dateRange: { earliest, latest },
            totalEvents: parsedICS.events.length,
            calendarName: parsedICS.calendarName,
            lastFetched: new Date().toISOString(),
          },
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch metadata' };
      }
    }

    default:
      return { success: false, error: 'Unknown message type' };
  }
};

// ============= Sync Logic =============

const runSync = async (
  icsUrl?: string,
): Promise<{
  calendar: {
    summary: { created: number; updated: number; deleted: number; unchanged: number; errors: number };
    details: SyncReport;
  };
  tasks: {
    summary: {
      lists_created: number;
      lists_existing: number;
      tasks_created: number;
      tasks_updated: number;
      tasks_deleted: number;
      tasks_unchanged: number;
      errors: number;
    };
    details: {
      taskLists: TaskSyncReport['taskLists'];
      tasks: TaskSyncReport['tasks'];
      errors: TaskSyncReport['errors'];
    };
  };
  metadata: {
    total_events_parsed: number;
    events_to_calendar: number;
    events_to_tasks: number;
    filtered_out: number;
    sync_started_at: Date;
    sync_completed_at: Date;
  };
}> => {
  const syncStartedAt = new Date();
  const user = await userStorage.get();
  if (!user) throw new Error('User not found');

  const feedUrl = icsUrl || user.canvas_ics_feed_url;
  if (!feedUrl) throw new Error('No ICS URL configured');

  await syncStateStorage.set({ is_syncing: true });

  try {
    const parsedICS = await icsParser.fetchAndParse(feedUrl);
    const preferences = user.preferences || DEFAULT_PREFERENCES;
    const totalEventsParsed = parsedICS.events.length;

    // Filter events
    const calendarEvents: CanvasEvent[] = [];
    const taskEvents: CanvasEvent[] = [];

    for (const event of parsedICS.events) {
      const courseCode = event.courseCode || '';

      // Calendar filtering: event type must match, and course must be included (empty = all)
      if (preferences.calendar.event_types.includes(event.eventType)) {
        const includedCourses = preferences.calendar.included_courses;
        // If includedCourses is empty, include all; otherwise check if course is in list
        if (includedCourses.length === 0 || !courseCode || includedCourses.includes(courseCode)) {
          calendarEvents.push(event);
        }
      }

      // Tasks filtering: event type must match, and course must be included (empty = all)
      if (preferences.tasks.event_types.includes(event.eventType)) {
        const includedCourses = preferences.tasks.included_courses;
        // If includedCourses is empty, include all; otherwise check if course is in list
        if (includedCourses.length === 0 || !courseCode || includedCourses.includes(courseCode)) {
          taskEvents.push(event);
        }
      }
    }

    console.log(
      `[Canvas2Calendar] Filter: ${parsedICS.events.length} total, ${calendarEvents.length} for calendar, ${taskEvents.length} for tasks`,
    );
    console.log(
      `[Canvas2Calendar] Prefs: calendar.event_types=${JSON.stringify(preferences.calendar.event_types)}, tasks.event_types=${JSON.stringify(preferences.tasks.event_types)}`,
    );

    const filteredOut = totalEventsParsed - Math.max(calendarEvents.length, taskEvents.length);

    const [calendarReport, tasksReport] = await Promise.all([
      syncCalendarEvents(calendarEvents, preferences),
      syncTasks(taskEvents, preferences),
    ]);

    const syncCompletedAt = new Date();

    await syncStateStorage.set({
      is_syncing: false,
      last_sync_at: syncCompletedAt.toISOString(),
    });

    // Return ApiSyncReport format
    return {
      calendar: {
        summary: {
          created: calendarReport.created.length,
          updated: calendarReport.updated.length,
          deleted: calendarReport.deleted.length,
          unchanged: calendarReport.unchanged.length,
          errors: calendarReport.errors.length,
        },
        details: calendarReport,
      },
      tasks: {
        summary: {
          lists_created: tasksReport.taskLists.created.length,
          lists_existing: tasksReport.taskLists.existing.length,
          tasks_created: tasksReport.tasks.created.length,
          tasks_updated: tasksReport.tasks.updated.length,
          tasks_deleted: tasksReport.tasks.deleted.length,
          tasks_unchanged: tasksReport.tasks.unchanged.length,
          errors: tasksReport.errors.length,
        },
        details: {
          taskLists: tasksReport.taskLists,
          tasks: tasksReport.tasks,
          errors: tasksReport.errors,
        },
      },
      metadata: {
        total_events_parsed: totalEventsParsed,
        events_to_calendar: calendarEvents.length,
        events_to_tasks: taskEvents.length,
        filtered_out: filteredOut,
        sync_started_at: syncStartedAt,
        sync_completed_at: syncCompletedAt,
      },
    };
  } catch (error) {
    await syncStateStorage.set({
      is_syncing: false,
      last_sync_error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
};

const syncCalendarEvents = async (events: CanvasEvent[], preferences: SyncPreferences): Promise<SyncReport> => {
  const report: SyncReport = { created: [], updated: [], deleted: [], unchanged: [], errors: [] };

  let calendar = await calendarStorage.get();
  if (!calendar) {
    report.errors.push({ error: 'No calendar configured' });
    return report;
  }

  // Verify calendar still exists in Google (self-healing check)
  try {
    await CalendarAPI.getCalendar(calendar.google_calendar_id);
  } catch (error) {
    if (error instanceof GoogleApiException && (error.isNotFound() || error.isGone())) {
      console.log('[Canvas2Calendar] Calendar was deleted externally, recreating...');

      // Clear stale data
      await calendarStorage.set(null);
      await eventsStorage.set({});

      // Recreate calendar
      const newCalendar = await CalendarAPI.createCalendar({
        summary: calendar.title || 'Canvas Sync Calendar',
        description: 'Synced from Canvas (auto-recreated)',
      });

      if (!newCalendar.id) {
        report.errors.push({ error: 'Failed to recreate calendar' });
        return report;
      }

      const newCalendarData: CalendarDataState = {
        google_calendar_id: newCalendar.id,
        title: newCalendar.summary || 'Canvas Calendar',
        created_at: new Date().toISOString(),
      };

      await calendarStorage.set(newCalendarData);
      calendar = newCalendarData;

      console.log('[Canvas2Calendar] Calendar recreated successfully');
    } else {
      throw error; // Re-throw other errors
    }
  }

  const existingEvents = await eventsStorage.get();
  const incomingMap = new Map<string, { event: CanvasEvent; hash: string }>();

  for (const event of events) {
    const hash = await generateEventHash(event);
    incomingMap.set(event.uid, { event, hash });
  }

  console.log(
    `[Canvas2Calendar] Sync: ${events.length} events to process, ${Object.keys(existingEvents).length} existing, calendar: ${calendar.google_calendar_id}`,
  );

  // Create/Update
  for (const [icsUid, { event, hash }] of incomingMap) {
    try {
      const existing = existingEvents[icsUid];

      if (!existing) {
        // Create
        const googleEvent = await CalendarAPI.createEvent(calendar.google_calendar_id, {
          summary: event.summary,
          description: event.description,
          start: event.isAllDay
            ? { date: event.dtstart.toISOString().split('T')[0] }
            : { dateTime: event.dtstart.toISOString() },
          end: event.isAllDay
            ? { date: event.dtend.toISOString().split('T')[0] }
            : { dateTime: event.dtend.toISOString() },
          location: event.location,
          extendedProperties: { private: { ics_uid: icsUid, event_hash: hash, source: 'canvas2calendar' } },
        });

        if (googleEvent.id) {
          existingEvents[icsUid] = {
            ics_uid: icsUid,
            google_event_id: googleEvent.id,
            title: event.summary,
            description: event.description,
            start_time: event.dtstart.toISOString(),
            end_time: event.dtend.toISOString(),
            is_all_day: event.isAllDay,
            location: event.location,
            event_hash: hash,
            course_code: event.courseCode,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          report.created.push({ ics_uid: icsUid, title: event.summary, id: googleEvent.id });
        }
      } else if (existing.event_hash !== hash) {
        // Update - but handle case where event was deleted externally
        try {
          await CalendarAPI.updateEvent(calendar.google_calendar_id, existing.google_event_id, {
            summary: event.summary,
            description: event.description,
            start: event.isAllDay
              ? { date: event.dtstart.toISOString().split('T')[0] }
              : { dateTime: event.dtstart.toISOString() },
            end: event.isAllDay
              ? { date: event.dtend.toISOString().split('T')[0] }
              : { dateTime: event.dtend.toISOString() },
            location: event.location,
            extendedProperties: { private: { ics_uid: icsUid, event_hash: hash, source: 'canvas2calendar' } },
          });

          existingEvents[icsUid] = {
            ...existing,
            title: event.summary,
            description: event.description,
            start_time: event.dtstart.toISOString(),
            end_time: event.dtend.toISOString(),
            is_all_day: event.isAllDay,
            location: event.location,
            event_hash: hash,
            updated_at: new Date().toISOString(),
          };
          report.updated.push({ ics_uid: icsUid, title: event.summary, id: existing.google_event_id });
        } catch (updateError) {
          // Event was deleted externally - recreate it
          if (updateError instanceof GoogleApiException && (updateError.isNotFound() || updateError.isGone())) {
            console.log(`[Canvas2Calendar] Event ${icsUid} was deleted externally, recreating...`);
            delete existingEvents[icsUid]; // Clear stale reference

            // Recreate the event
            const googleEvent = await CalendarAPI.createEvent(calendar.google_calendar_id, {
              summary: event.summary,
              description: event.description,
              start: event.isAllDay
                ? { date: event.dtstart.toISOString().split('T')[0] }
                : { dateTime: event.dtstart.toISOString() },
              end: event.isAllDay
                ? { date: event.dtend.toISOString().split('T')[0] }
                : { dateTime: event.dtend.toISOString() },
              location: event.location,
              extendedProperties: { private: { ics_uid: icsUid, event_hash: hash, source: 'canvas2calendar' } },
            });

            if (googleEvent.id) {
              existingEvents[icsUid] = {
                ics_uid: icsUid,
                google_event_id: googleEvent.id,
                title: event.summary,
                description: event.description,
                start_time: event.dtstart.toISOString(),
                end_time: event.dtend.toISOString(),
                is_all_day: event.isAllDay,
                location: event.location,
                event_hash: hash,
                course_code: event.courseCode,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              report.created.push({ ics_uid: icsUid, title: event.summary, id: googleEvent.id });
            }
          } else {
            throw updateError;
          }
        }
      } else {
        report.unchanged.push({ ics_uid: icsUid, title: event.summary });
      }
    } catch (error) {
      report.errors.push({ ics_uid: icsUid, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  // Delete events that are no longer needed
  // Reasons: not in ICS feed, excluded course, or outside date range
  const now = new Date();
  const dateRange = preferences.data_management?.date_range;
  const pastCutoff = dateRange ? new Date(now.getTime() - dateRange.past_days * 24 * 60 * 60 * 1000) : null;
  const futureCutoff = dateRange ? new Date(now.getTime() + dateRange.future_days * 24 * 60 * 60 * 1000) : null;
  const includedCourses = preferences.calendar.included_courses;
  // const eventTypes = preferences.calendar.event_types;

  for (const [icsUid, existing] of Object.entries(existingEvents)) {
    let shouldDelete = false;
    let deleteReason = '';

    // 1. Not in incoming ICS feed anymore
    if (!incomingMap.has(icsUid)) {
      shouldDelete = true;
      deleteReason = 'not in ICS feed';
    }

    // 2. Course was excluded from preferences
    if (!shouldDelete && existing.course_code && includedCourses.length > 0) {
      if (!includedCourses.includes(existing.course_code)) {
        shouldDelete = true;
        deleteReason = `course "${existing.course_code}" excluded`;
      }
    }

    // 3. Event is outside date range
    if (!shouldDelete && pastCutoff && futureCutoff) {
      const eventDate = new Date(existing.start_time);
      if (eventDate < pastCutoff || eventDate > futureCutoff) {
        shouldDelete = true;
        deleteReason = 'outside date range';
      }
    }

    if (shouldDelete) {
      try {
        await CalendarAPI.deleteEvent(calendar.google_calendar_id, existing.google_event_id);
        delete existingEvents[icsUid];
        report.deleted.push({ ics_uid: icsUid, title: existing.title, id: existing.google_event_id });
        if (deleteReason !== 'not in ICS feed') {
          console.log(`[Canvas2Calendar] Deleted event "${existing.title}": ${deleteReason}`);
        }
      } catch (error) {
        // Ignore 404 errors (already deleted)
        if (!(error instanceof GoogleApiException && error.isNotFound())) {
          report.errors.push({ ics_uid: icsUid, error: error instanceof Error ? error.message : 'Unknown error' });
        } else {
          delete existingEvents[icsUid]; // Clean up stale reference
        }
      }
    }
  }

  await eventsStorage.set(existingEvents);
  return report;
};

const syncTasks = async (events: CanvasEvent[], preferences: SyncPreferences): Promise<TaskSyncReport> => {
  const report: TaskSyncReport = {
    taskLists: { created: [], existing: [] },
    tasks: { created: [], updated: [], deleted: [], unchanged: [] },
    errors: [],
  };

  // Group by course
  const eventsByCourse = new Map<string, CanvasEvent[]>();
  for (const event of events) {
    const code = event.courseCode || 'Uncategorized';
    if (!eventsByCourse.has(code)) eventsByCourse.set(code, []);
    eventsByCourse.get(code)!.push(event);
  }

  const taskLists = await taskListsStorage.get();
  const tasks = await tasksStorage.get();

  for (const [courseCode, courseEvents] of eventsByCourse) {
    try {
      let taskList = taskLists[courseCode];
      let googleTaskListId: string;

      if (!taskList) {
        // No local record - create new task list
        const created = await TasksAPI.createTaskList({ title: courseCode });
        if (!created.id) continue;
        googleTaskListId = created.id;
        taskList = { google_task_list_id: googleTaskListId, title: courseCode, created_at: new Date().toISOString() };
        taskLists[courseCode] = taskList;
        report.taskLists.created.push({ title: courseCode, id: googleTaskListId });
      } else {
        // Have local record - verify it still exists in Google (self-healing)
        try {
          await TasksAPI.getTaskList(taskList.google_task_list_id);
          googleTaskListId = taskList.google_task_list_id;
          report.taskLists.existing.push({ title: courseCode, id: googleTaskListId });
        } catch (verifyError) {
          if (verifyError instanceof GoogleApiException && (verifyError.isNotFound() || verifyError.isGone())) {
            console.log(`[Canvas2Calendar] Task list "${courseCode}" was deleted externally, recreating...`);

            // Clear stale tasks for this course
            for (const [taskUid, task] of Object.entries(tasks)) {
              if (task.course_code === courseCode) {
                delete tasks[taskUid];
              }
            }

            // Recreate task list
            const created = await TasksAPI.createTaskList({ title: courseCode });
            if (!created.id) continue;
            googleTaskListId = created.id;
            taskList = {
              google_task_list_id: googleTaskListId,
              title: courseCode,
              created_at: new Date().toISOString(),
            };
            taskLists[courseCode] = taskList;
            report.taskLists.created.push({ title: courseCode, id: googleTaskListId });

            console.log(`[Canvas2Calendar] Task list "${courseCode}" recreated successfully`);
          } else {
            throw verifyError;
          }
        }
      }

      for (const event of courseEvents) {
        const hash = await generateEventHash(event);
        const existing = tasks[event.uid];

        try {
          if (!existing) {
            const created = await TasksAPI.createTask(googleTaskListId, {
              title: event.summary,
              notes: event.description,
              due: event.dtstart.toISOString(),
            });
            if (created.id) {
              tasks[event.uid] = {
                ics_uid: event.uid,
                google_task_id: created.id,
                google_task_list_id: googleTaskListId,
                title: event.summary,
                notes: event.description,
                due_date: event.dtstart.toISOString(),
                task_hash: hash,
                course_code: courseCode,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              report.tasks.created.push({
                ics_uid: event.uid,
                title: event.summary,
                id: created.id,
                taskListTitle: courseCode,
              });
            }
          } else if (existing.task_hash !== hash) {
            // Update task - but handle case where task was deleted externally
            try {
              await TasksAPI.updateTask(existing.google_task_list_id, existing.google_task_id, {
                title: event.summary,
                notes: event.description,
                due: event.dtstart.toISOString(),
              });
              tasks[event.uid] = {
                ...existing,
                title: event.summary,
                notes: event.description,
                due_date: event.dtstart.toISOString(),
                task_hash: hash,
                updated_at: new Date().toISOString(),
              };
              report.tasks.updated.push({
                ics_uid: event.uid,
                title: event.summary,
                id: existing.google_task_id,
                taskListTitle: courseCode,
              });
            } catch (updateError) {
              // Task was deleted externally - recreate it
              if (updateError instanceof GoogleApiException && (updateError.isNotFound() || updateError.isGone())) {
                console.log(`[Canvas2Calendar] Task ${event.uid} was deleted externally, recreating...`);
                delete tasks[event.uid]; // Clear stale reference

                // Recreate the task
                const created = await TasksAPI.createTask(googleTaskListId, {
                  title: event.summary,
                  notes: event.description,
                  due: event.dtstart.toISOString(),
                });

                if (created.id) {
                  tasks[event.uid] = {
                    ics_uid: event.uid,
                    google_task_id: created.id,
                    google_task_list_id: googleTaskListId,
                    title: event.summary,
                    notes: event.description,
                    due_date: event.dtstart.toISOString(),
                    task_hash: hash,
                    course_code: courseCode,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  };
                  report.tasks.created.push({
                    ics_uid: event.uid,
                    title: event.summary,
                    id: created.id,
                    taskListTitle: courseCode,
                  });
                }
              } else {
                throw updateError;
              }
            }
          } else {
            report.tasks.unchanged.push({ ics_uid: event.uid, title: event.summary, taskListTitle: courseCode });
          }
        } catch (error) {
          report.errors.push({
            ics_uid: event.uid,
            courseCode,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    } catch (error) {
      report.errors.push({ courseCode, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  // Delete tasks that no longer match preferences
  // Build a set of all incoming task UIDs
  const incomingTaskUids = new Set<string>();
  for (const event of events) {
    incomingTaskUids.add(event.uid);
  }

  // Date range calculations
  const now = new Date();
  const dateRange = preferences.data_management?.date_range;
  const pastCutoff = dateRange ? new Date(now.getTime() - dateRange.past_days * 24 * 60 * 60 * 1000) : null;
  const futureCutoff = dateRange ? new Date(now.getTime() + dateRange.future_days * 24 * 60 * 60 * 1000) : null;
  const includedCourses = preferences.tasks.included_courses;

  for (const [taskUid, task] of Object.entries(tasks)) {
    let shouldDelete = false;
    let deleteReason = '';

    // 1. Not in incoming events anymore
    if (!incomingTaskUids.has(taskUid)) {
      shouldDelete = true;
      deleteReason = 'not in ICS feed';
    }

    // 2. Course was excluded from preferences
    if (!shouldDelete && task.course_code && includedCourses.length > 0) {
      if (!includedCourses.includes(task.course_code)) {
        shouldDelete = true;
        deleteReason = `course "${task.course_code}" excluded`;
      }
    }

    // 3. Task is outside date range
    if (!shouldDelete && pastCutoff && futureCutoff && task.due_date) {
      const taskDate = new Date(task.due_date);
      if (taskDate < pastCutoff || taskDate > futureCutoff) {
        shouldDelete = true;
        deleteReason = 'outside date range';
      }
    }

    if (shouldDelete) {
      try {
        await TasksAPI.deleteTask(task.google_task_list_id, task.google_task_id);
        delete tasks[taskUid];
        report.tasks.deleted.push({
          ics_uid: taskUid,
          title: task.title,
          id: task.google_task_id,
          taskListTitle: task.course_code,
        });
        if (deleteReason !== 'not in ICS feed') {
          console.log(`[Canvas2Calendar] Deleted task "${task.title}": ${deleteReason}`);
        }
      } catch (error) {
        // Ignore 404 errors (already deleted)
        if (!(error instanceof GoogleApiException && error.isNotFound())) {
          report.errors.push({
            ics_uid: taskUid,
            courseCode: task.course_code,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        } else {
          delete tasks[taskUid]; // Clean up stale reference
        }
      }
    }
  }

  // Clean up empty task lists (for excluded courses)
  for (const [courseCode, taskList] of Object.entries(taskLists)) {
    // Check if course is excluded from preferences
    if (includedCourses.length > 0 && !includedCourses.includes(courseCode)) {
      try {
        await TasksAPI.deleteTaskList(taskList.google_task_list_id);
        delete taskLists[courseCode];
        console.log(`[Canvas2Calendar] Deleted task list "${courseCode}": course excluded`);
      } catch (error) {
        if (!(error instanceof GoogleApiException && error.isNotFound())) {
          report.errors.push({ courseCode, error: error instanceof Error ? error.message : 'Unknown error' });
        } else {
          delete taskLists[courseCode]; // Clean up stale reference
        }
      }
    }
  }

  await taskListsStorage.set(taskLists);
  await tasksStorage.set(tasks);
  return report;
};

// ============= Export Types =============

export type BackgroundMessage =
  | { type: 'SIGN_IN' }
  | { type: 'SIGN_OUT' }
  | { type: 'SYNC_NOW'; icsUrl?: string }
  | { type: 'GET_STATUS' }
  | { type: 'GET_USER' }
  | { type: 'SET_ICS_URL'; url: string }
  | { type: 'UPDATE_PREFERENCES'; preferences: Partial<SyncPreferences> }
  | { type: 'CREATE_CALENDAR'; name: string; description?: string }
  | { type: 'RESET_ALL' }
  | { type: 'GET_CANVAS_METADATA' };

export type BackgroundResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };
