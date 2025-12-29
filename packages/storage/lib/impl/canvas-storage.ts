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
  SubscriptionCacheState,
} from './canvas-types.js';

// ============= Storage Keys =============

const STORAGE_KEYS = {
  USER: 'canvas2cal:user',
  CALENDAR: 'canvas2cal:calendar',
  SYNC_STATE: 'canvas2cal:sync-state',
  EVENTS: 'canvas2cal:events',
  TASK_LISTS: 'canvas2cal:task-lists',
  TASKS: 'canvas2cal:tasks',
  SUBSCRIPTION_CACHE: 'canvas2cal:subscription-cache',
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

/**
 * Subscription cache storage
 * Caches subscription status to reduce Edge Function calls
 */
const subscriptionCacheStorage = createStorage<SubscriptionCacheState | null>(STORAGE_KEYS.SUBSCRIPTION_CACHE, null, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

// Subscription cache TTL: 5 minutes
const SUBSCRIPTION_CACHE_TTL_MS = 5 * 60 * 1000;

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
  await subscriptionCacheStorage.set(null);
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

/**
 * Get cached subscription if still valid (within TTL)
 * Returns null if cache is expired or doesn't exist
 */
const getCachedSubscription = async (): Promise<SubscriptionCacheState | null> => {
  const cached = await subscriptionCacheStorage.get();
  if (!cached) return null;

  const now = Date.now();
  if (now - cached.cached_at > SUBSCRIPTION_CACHE_TTL_MS) {
    // Cache expired, clear it
    await subscriptionCacheStorage.set(null);
    return null;
  }

  return cached;
};

/**
 * Cache subscription status with current timestamp
 */
const setCachedSubscription = async (subscription: Omit<SubscriptionCacheState, 'cached_at'>): Promise<void> => {
  await subscriptionCacheStorage.set({
    ...subscription,
    cached_at: Date.now(),
  });
};

/**
 * Clear subscription cache (call on logout or subscription change)
 */
const clearSubscriptionCache = async (): Promise<void> => {
  await subscriptionCacheStorage.set(null);
};

export {
  userStorage,
  calendarStorage,
  syncStateStorage,
  eventsStorage,
  taskListsStorage,
  tasksStorage,
  subscriptionCacheStorage,
  clearAllCanvas2CalData,
  getCanvas2CalStorageStats,
  getCachedSubscription,
  setCachedSubscription,
  clearSubscriptionCache,
  SUBSCRIPTION_CACHE_TTL_MS,
};
