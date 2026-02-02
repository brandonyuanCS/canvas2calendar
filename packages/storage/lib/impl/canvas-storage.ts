/**
 * Canvas2Calendar Storage Implementations
 * Uses the createStorage helper to create reactive storage for sync data
 *
 * Multi-Account Support:
 * - Uses activeAccountStorage to track currently signed-in user
 * - getAccountStorage(userId) factory creates user-scoped storage instances
 * - Legacy flat-key exports maintained for migration compatibility
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
  ActiveAccountState,
} from './canvas-types.js';

// ============= Storage Keys =============

const STORAGE_KEYS = {
  // Global (not user-scoped)
  ACTIVE_ACCOUNT: 'canvas2cal:active-account',
  MIGRATION_FLAG: 'canvas2cal:migration-v2',

  // Legacy flat keys (for migration)
  USER: 'canvas2cal:user',
  CALENDAR: 'canvas2cal:calendar',
  SYNC_STATE: 'canvas2cal:sync-state',
  EVENTS: 'canvas2cal:events',
  TASK_LISTS: 'canvas2cal:task-lists',
  TASKS: 'canvas2cal:tasks',
  SUBSCRIPTION_CACHE: 'canvas2cal:subscription-cache',
} as const;

// User-scoped key generator
const getUserKey = (baseKey: string, userId: string) => `${baseKey}:${userId}`;

// ============= Default Values =============

const DEFAULT_CALENDAR: CalendarDataState | null = null;

const DEFAULT_SYNC_STATE: SyncStateData = {
  is_syncing: false,
};

const DEFAULT_EVENTS: EventsMapState = {};
const DEFAULT_TASK_LISTS: TaskListsMapState = {};
const DEFAULT_TASKS: TasksMapState = {};

// ============= Active Account Storage (Global) =============

/**
 * Active account storage - tracks which user is currently signed in
 * This is NOT user-scoped - it's a global setting for the extension
 */
const activeAccountStorage = createStorage<ActiveAccountState | null>(STORAGE_KEYS.ACTIVE_ACCOUNT, null, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

// ============= User-Scoped Storage Factory =============

/**
 * Storage instance cache to avoid creating duplicate storage objects
 */
const storageCache = new Map<string, ReturnType<typeof createAccountStorageInternal>>();

/**
 * Creates user-scoped storage instances for a specific user
 * @param userId - Google user ID to scope storage to
 */
const createAccountStorageInternal = (userId: string) => ({
  user: createStorage<UserDataState | null>(getUserKey(STORAGE_KEYS.USER, userId), null, {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  }),
  calendar: createStorage<CalendarDataState | null>(getUserKey(STORAGE_KEYS.CALENDAR, userId), DEFAULT_CALENDAR, {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  }),
  syncState: createStorage<SyncStateData>(getUserKey(STORAGE_KEYS.SYNC_STATE, userId), DEFAULT_SYNC_STATE, {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  }),
  events: createStorage<EventsMapState>(getUserKey(STORAGE_KEYS.EVENTS, userId), DEFAULT_EVENTS, {
    storageEnum: StorageEnum.Local,
    liveUpdate: false, // Large object, avoid live updates for perf
  }),
  taskLists: createStorage<TaskListsMapState>(getUserKey(STORAGE_KEYS.TASK_LISTS, userId), DEFAULT_TASK_LISTS, {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  }),
  tasks: createStorage<TasksMapState>(getUserKey(STORAGE_KEYS.TASKS, userId), DEFAULT_TASKS, {
    storageEnum: StorageEnum.Local,
    liveUpdate: false, // Large object, avoid live updates for perf
  }),
  subscriptionCache: createStorage<SubscriptionCacheState | null>(
    getUserKey(STORAGE_KEYS.SUBSCRIPTION_CACHE, userId),
    null,
    {
      storageEnum: StorageEnum.Local,
      liveUpdate: true,
    },
  ),
});

/**
 * Get or create user-scoped storage for a specific user
 * Caches storage instances to avoid recreation
 */
const getAccountStorage = (userId: string) => {
  let storage = storageCache.get(userId);
  if (!storage) {
    storage = createAccountStorageInternal(userId);
    storageCache.set(userId, storage);
  }
  return storage;
};

// ============= Legacy Storage Instances (for migration compatibility) =============

/**
 * @deprecated Use getAccountStorage(userId).user instead
 * Kept for backward compatibility during migration
 */
const userStorage = createStorage<UserDataState | null>(STORAGE_KEYS.USER, null, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

/**
 * @deprecated Use getAccountStorage(userId).calendar instead
 */
const calendarStorage = createStorage<CalendarDataState | null>(STORAGE_KEYS.CALENDAR, DEFAULT_CALENDAR, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

/**
 * @deprecated Use getAccountStorage(userId).syncState instead
 */
const syncStateStorage = createStorage<SyncStateData>(STORAGE_KEYS.SYNC_STATE, DEFAULT_SYNC_STATE, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

/**
 * @deprecated Use getAccountStorage(userId).events instead
 */
const eventsStorage = createStorage<EventsMapState>(STORAGE_KEYS.EVENTS, DEFAULT_EVENTS, {
  storageEnum: StorageEnum.Local,
  liveUpdate: false,
});

/**
 * @deprecated Use getAccountStorage(userId).taskLists instead
 */
const taskListsStorage = createStorage<TaskListsMapState>(STORAGE_KEYS.TASK_LISTS, DEFAULT_TASK_LISTS, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

/**
 * @deprecated Use getAccountStorage(userId).tasks instead
 */
const tasksStorage = createStorage<TasksMapState>(STORAGE_KEYS.TASKS, DEFAULT_TASKS, {
  storageEnum: StorageEnum.Local,
  liveUpdate: false,
});

/**
 * @deprecated Use getAccountStorage(userId).subscriptionCache instead
 */
const subscriptionCacheStorage = createStorage<SubscriptionCacheState | null>(STORAGE_KEYS.SUBSCRIPTION_CACHE, null, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

// Subscription cache TTL: 5 minutes
const SUBSCRIPTION_CACHE_TTL_MS = 5 * 60 * 1000;

// ============= Helper Functions =============

/**
 * Clear all Canvas2Calendar data for a specific user
 */
const clearAccountData = async (userId: string): Promise<void> => {
  const storage = getAccountStorage(userId);
  await storage.user.set(null);
  await storage.calendar.set(null);
  await storage.syncState.set(DEFAULT_SYNC_STATE);
  await storage.events.set({});
  await storage.taskLists.set({});
  await storage.tasks.set({});
  await storage.subscriptionCache.set(null);
};

/**
 * Clear all Canvas2Calendar data (legacy - clears flat-key data)
 * @deprecated Use clearAccountData(userId) instead
 */
const clearAllCanvas2CalData = async (): Promise<void> => {
  await userStorage.set(null);
  await calendarStorage.set(null);
  await syncStateStorage.set(DEFAULT_SYNC_STATE);
  await eventsStorage.set({});
  await taskListsStorage.set({});
  await tasksStorage.set({});
  await subscriptionCacheStorage.set(null);
  await activeAccountStorage.set(null);
};

/**
 * Get storage statistics for a specific user
 */
const getAccountStorageStats = async (
  userId: string,
): Promise<{
  hasUser: boolean;
  hasCalendar: boolean;
  eventCount: number;
  taskListCount: number;
  taskCount: number;
}> => {
  const storage = getAccountStorage(userId);
  const [user, calendar, events, taskLists, tasks] = await Promise.all([
    storage.user.get(),
    storage.calendar.get(),
    storage.events.get(),
    storage.taskLists.get(),
    storage.tasks.get(),
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
 * Get storage statistics (legacy)
 * @deprecated Use getAccountStorageStats(userId) instead
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
 * Get cached subscription for a specific user if still valid
 */
const getCachedSubscriptionForUser = async (userId: string): Promise<SubscriptionCacheState | null> => {
  const storage = getAccountStorage(userId);
  const cached = await storage.subscriptionCache.get();
  if (!cached) return null;

  const now = Date.now();
  if (now - cached.cached_at > SUBSCRIPTION_CACHE_TTL_MS) {
    await storage.subscriptionCache.set(null);
    return null;
  }

  return cached;
};

/**
 * Get cached subscription if still valid (legacy)
 * @deprecated Use getCachedSubscriptionForUser(userId) instead
 */
const getCachedSubscription = async (): Promise<SubscriptionCacheState | null> => {
  const cached = await subscriptionCacheStorage.get();
  if (!cached) return null;

  const now = Date.now();
  if (now - cached.cached_at > SUBSCRIPTION_CACHE_TTL_MS) {
    await subscriptionCacheStorage.set(null);
    return null;
  }

  return cached;
};

/**
 * Cache subscription status for a specific user
 */
const setCachedSubscriptionForUser = async (
  userId: string,
  subscription: Omit<SubscriptionCacheState, 'cached_at'>,
): Promise<void> => {
  const storage = getAccountStorage(userId);
  await storage.subscriptionCache.set({
    ...subscription,
    cached_at: Date.now(),
  });
};

/**
 * Cache subscription status (legacy)
 * @deprecated Use setCachedSubscriptionForUser(userId, subscription) instead
 */
const setCachedSubscription = async (subscription: Omit<SubscriptionCacheState, 'cached_at'>): Promise<void> => {
  await subscriptionCacheStorage.set({
    ...subscription,
    cached_at: Date.now(),
  });
};

/**
 * Clear subscription cache for a specific user
 */
const clearSubscriptionCacheForUser = async (userId: string): Promise<void> => {
  const storage = getAccountStorage(userId);
  await storage.subscriptionCache.set(null);
};

/**
 * Clear subscription cache (legacy)
 * @deprecated Use clearSubscriptionCacheForUser(userId) instead
 */
const clearSubscriptionCache = async (): Promise<void> => {
  await subscriptionCacheStorage.set(null);
};

// ============= Migration =============

/**
 * Migrate existing flat-key data to user-scoped storage
 * Should be called once on extension startup
 */
const migrateToUserScopedStorage = async (): Promise<{ migrated: boolean; userId?: string }> => {
  // Check if already migrated
  const result = await chrome.storage.local.get(STORAGE_KEYS.MIGRATION_FLAG);
  if (result[STORAGE_KEYS.MIGRATION_FLAG]) {
    return { migrated: false };
  }

  // Get old flat-key user data
  const oldUser = await userStorage.get();
  if (!oldUser?.google_user_id) {
    // No data to migrate, mark as complete
    await chrome.storage.local.set({ [STORAGE_KEYS.MIGRATION_FLAG]: true });
    return { migrated: false };
  }

  const userId = oldUser.google_user_id;
  console.log(`[Canvas2Calendar] Migrating data for user ${userId}...`);

  // Get all old data
  const [oldCalendar, oldSyncState, oldEvents, oldTaskLists, oldTasks, oldSubCache] = await Promise.all([
    calendarStorage.get(),
    syncStateStorage.get(),
    eventsStorage.get(),
    taskListsStorage.get(),
    tasksStorage.get(),
    subscriptionCacheStorage.get(),
  ]);

  // Create user-scoped storage and copy data
  const newStorage = getAccountStorage(userId);
  await Promise.all([
    newStorage.user.set(oldUser),
    newStorage.calendar.set(oldCalendar),
    newStorage.syncState.set(oldSyncState),
    newStorage.events.set(oldEvents),
    newStorage.taskLists.set(oldTaskLists),
    newStorage.tasks.set(oldTasks),
    newStorage.subscriptionCache.set(oldSubCache),
  ]);

  // Set as active account
  await activeAccountStorage.set({
    googleUserId: userId,
    email: oldUser.email,
  });

  // Mark migration complete
  await chrome.storage.local.set({ [STORAGE_KEYS.MIGRATION_FLAG]: true });

  console.log(`[Canvas2Calendar] Migration complete for user ${userId}`);
  return { migrated: true, userId };
};

export {
  // New multi-account exports
  activeAccountStorage,
  getAccountStorage,
  clearAccountData,
  getAccountStorageStats,
  getCachedSubscriptionForUser,
  setCachedSubscriptionForUser,
  clearSubscriptionCacheForUser,
  migrateToUserScopedStorage,

  // Legacy exports (deprecated but kept for compatibility)
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

/**
 * Type for the user-scoped storage object
 */
export type AccountStorage = ReturnType<typeof getAccountStorage>;
