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
import { getAuthToken, getUserInfo, CalendarAPI, TasksAPI } from '@extension/google-api';
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
        await userStorage.set({
          google_user_id: userInfo.id,
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture,
          preferences: DEFAULT_PREFERENCES,
          created_at: now,
          updated_at: now,
        });

        return { success: true, data: { email: userInfo.email, name: userInfo.name } };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Sign in failed' };
      }
    }

    case 'SIGN_OUT': {
      await clearAllCanvas2CalData();
      await chrome.alarms.clear(ALARM_NAME);
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

    default:
      return { success: false, error: 'Unknown message type' };
  }
};

// ============= Sync Logic =============

const runSync = async (icsUrl?: string): Promise<{ calendar: SyncReport; tasks: TaskSyncReport }> => {
  const user = await userStorage.get();
  if (!user) throw new Error('User not found');

  const feedUrl = icsUrl || user.canvas_ics_feed_url;
  if (!feedUrl) throw new Error('No ICS URL configured');

  await syncStateStorage.set({ is_syncing: true });

  try {
    const parsedICS = await icsParser.fetchAndParse(feedUrl);
    const preferences = user.preferences || DEFAULT_PREFERENCES;

    // Filter events
    const calendarEvents: CanvasEvent[] = [];
    const taskEvents: CanvasEvent[] = [];

    for (const event of parsedICS.events) {
      const courseCode = event.courseCode || '';

      if (preferences.calendar.event_types.includes(event.eventType)) {
        if (!courseCode || preferences.calendar.included_courses.includes(courseCode)) {
          calendarEvents.push(event);
        }
      }

      if (preferences.tasks.event_types.includes(event.eventType)) {
        if (!courseCode || preferences.tasks.included_courses.includes(courseCode)) {
          taskEvents.push(event);
        }
      }
    }

    const [calendarReport, tasksReport] = await Promise.all([
      syncCalendarEvents(calendarEvents),
      syncTasks(taskEvents),
    ]);

    await syncStateStorage.set({
      is_syncing: false,
      last_sync_at: new Date().toISOString(),
    });

    return { calendar: calendarReport, tasks: tasksReport };
  } catch (error) {
    await syncStateStorage.set({
      is_syncing: false,
      last_sync_error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
};

const syncCalendarEvents = async (events: CanvasEvent[]): Promise<SyncReport> => {
  const report: SyncReport = { created: [], updated: [], deleted: [], unchanged: [], errors: [] };

  const calendar = await calendarStorage.get();
  if (!calendar) {
    report.errors.push({ error: 'No calendar configured' });
    return report;
  }

  const existingEvents = await eventsStorage.get();
  const incomingMap = new Map<string, { event: CanvasEvent; hash: string }>();

  for (const event of events) {
    const hash = await generateEventHash(event);
    incomingMap.set(event.uid, { event, hash });
  }

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
        // Update
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
      } else {
        report.unchanged.push({ ics_uid: icsUid, title: event.summary });
      }
    } catch (error) {
      report.errors.push({ ics_uid: icsUid, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  // Delete
  for (const [icsUid, existing] of Object.entries(existingEvents)) {
    if (!incomingMap.has(icsUid) && icsUid.startsWith('event-')) {
      try {
        await CalendarAPI.deleteEvent(calendar.google_calendar_id, existing.google_event_id);
        delete existingEvents[icsUid];
        report.deleted.push({ ics_uid: icsUid, title: existing.title, id: existing.google_event_id });
      } catch (error) {
        report.errors.push({ ics_uid: icsUid, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }
  }

  await eventsStorage.set(existingEvents);
  return report;
};

const syncTasks = async (events: CanvasEvent[]): Promise<TaskSyncReport> => {
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
        const created = await TasksAPI.createTaskList({ title: courseCode });
        if (!created.id) continue;
        googleTaskListId = created.id;
        taskList = { google_task_list_id: googleTaskListId, title: courseCode, created_at: new Date().toISOString() };
        taskLists[courseCode] = taskList;
        report.taskLists.created.push({ title: courseCode, id: googleTaskListId });
      } else {
        googleTaskListId = taskList.google_task_list_id;
        report.taskLists.existing.push({ title: courseCode, id: googleTaskListId });
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
  | { type: 'RESET_ALL' };

export type BackgroundResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };
