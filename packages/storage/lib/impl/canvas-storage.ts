/**
 * Canvas2Calendar Storage Implementations
 * Uses the createStorage helper to create reactive storage for sync data
 */

import { createStorage, StorageEnum } from '../base/index.js';
import type {
  UserDataState,
  CalendarDataState,
  SyncStateData,
  EventsMapState,
  TaskListsMapState,
  TasksMapState,
} from './canvas-types.js';

// ============= Storage Keys =============

const STORAGE_KEYS = {
  USER: 'canvas2cal:user',
  CALENDAR: 'canvas2cal:calendar',
  SYNC_STATE: 'canvas2cal:sync-state',
  EVENTS: 'canvas2cal:events',
  TASK_LISTS: 'canvas2cal:task-lists',
  TASKS: 'canvas2cal:tasks',
} as const;

// ============= Default Values =============

const DEFAULT_CALENDAR: CalendarDataState | null = null;

const DEFAULT_SYNC_STATE: SyncStateData = {
  is_syncing: false,
};

const DEFAULT_EVENTS: EventsMapState = {};
const DEFAULT_TASK_LISTS: TaskListsMapState = {};
const DEFAULT_TASKS: TasksMapState = {};

// ============= Storage Instances =============

/**
 * User data storage
 * Stores the authenticated user's info and preferences
 */
const userStorage = createStorage<UserDataState | null>(STORAGE_KEYS.USER, null, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

/**
 * Calendar data storage
 * Stores the Google Calendar created for Canvas events
 */
const calendarStorage = createStorage<CalendarDataState | null>(STORAGE_KEYS.CALENDAR, DEFAULT_CALENDAR, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

/**
 * Sync state storage
 * Tracks ongoing sync progress for resumption
 */
const syncStateStorage = createStorage<SyncStateData>(STORAGE_KEYS.SYNC_STATE, DEFAULT_SYNC_STATE, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

/**
 * Events map storage
 * Stores all synced calendar events keyed by ics_uid
 */
const eventsStorage = createStorage<EventsMapState>(STORAGE_KEYS.EVENTS, DEFAULT_EVENTS, {
  storageEnum: StorageEnum.Local,
  liveUpdate: false, // Large object, avoid live updates for perf
});

/**
 * Task lists map storage
 * Stores all task lists keyed by course code
 */
const taskListsStorage = createStorage<TaskListsMapState>(STORAGE_KEYS.TASK_LISTS, DEFAULT_TASK_LISTS, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

/**
 * Tasks map storage
 * Stores all synced tasks keyed by ics_uid
 */
const tasksStorage = createStorage<TasksMapState>(STORAGE_KEYS.TASKS, DEFAULT_TASKS, {
  storageEnum: StorageEnum.Local,
  liveUpdate: false, // Large object, avoid live updates for perf
});

// ============= Helper Functions =============

/**
 * Clear all Canvas2Calendar data
 */
const clearAllCanvas2CalData = async (): Promise<void> => {
  await userStorage.set(null);
  await calendarStorage.set(null);
  await syncStateStorage.set(DEFAULT_SYNC_STATE);
  await eventsStorage.set({});
  await taskListsStorage.set({});
  await tasksStorage.set({});
};

/**
 * Get storage statistics
 */
const getCanvas2CalStorageStats = async (): Promise<{
  hasUser: boolean;
  hasCalendar: boolean;
  eventCount: number;
  taskListCount: number;
  taskCount: number;
}> => {
  const [user, calendar, events, taskLists, tasks] = await Promise.all([
    userStorage.get(),
    calendarStorage.get(),
    eventsStorage.get(),
    taskListsStorage.get(),
    tasksStorage.get(),
  ]);

  return {
    hasUser: !!user?.google_user_id,
    hasCalendar: !!calendar?.google_calendar_id,
    eventCount: Object.keys(events).length,
    taskListCount: Object.keys(taskLists).length,
    taskCount: Object.keys(tasks).length,
  };
};

export {
  userStorage,
  calendarStorage,
  syncStateStorage,
  eventsStorage,
  taskListsStorage,
  tasksStorage,
  clearAllCanvas2CalData,
  getCanvas2CalStorageStats,
};
