/**
 * Canvas2Calendar Storage Types (Domain-Specific)
 * Data structures for persisting sync state in chrome.storage.local
 *
 * Ownership: @extension/storage package
 * These types are specific to the storage implementation and should not be moved to shared
 */

import type { SyncPreferences } from '@extension/shared';

// ============= User Data =============

export interface UserDataState {
  google_user_id: string;
  email: string;
  name?: string;
  picture?: string;
  // Supabase integration
  supabase_user_id?: string;
  subscription_tier: 'free' | 'pro' | 'max';
  subscription_status?: 'active' | 'canceled' | 'past_due' | 'trialing'; // Legacy field, optional
  // Canvas data
  canvas_ics_feed_url?: string;
  preferences?: SyncPreferences;
  // If preferences is undefined, use DEFAULT_PREFERENCES
  // For tracking preference sync state:
  last_synced_preferences?: SyncPreferences;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

// ============= Calendar Data =============

export interface CalendarDataState {
  google_calendar_id: string;
  title: string;
  created_at: string;
}

// ============= Event Data =============

export interface StoredEventState {
  ics_uid: string;
  google_event_id: string;
  title: string;
  description?: string;
  start_time: string; // ISO string
  end_time: string; // ISO string
  is_all_day: boolean;
  location?: string;
  event_hash: string;
  course_code?: string;
  created_at: string;
  updated_at: string;
}

// ============= Task List Data =============

export interface TaskListDataState {
  google_task_list_id: string;
  title: string; // Course code
  created_at: string;
}

// ============= Task Data =============

export interface StoredTaskState {
  ics_uid: string;
  google_task_id: string;
  google_task_list_id: string;
  title: string;
  notes?: string;
  due_date?: string; // ISO string
  task_hash: string;
  course_code: string;
  created_at: string;
  updated_at: string;
}

// ============= Sync State =============

export interface SyncStateData {
  is_syncing: boolean;
  last_sync_at?: string;
  last_sync_error?: string;
  // For resumption after worker termination
  current_batch_index?: number;
  pending_event_uids?: string[];
}

// ============= Storage Keys Map =============

export interface EventsMapState {
  [icsUid: string]: StoredEventState;
}

export interface TaskListsMapState {
  [courseCode: string]: TaskListDataState;
}

export interface TasksMapState {
  [icsUid: string]: StoredTaskState;
}

// ============= Subscription Cache =============

export interface SubscriptionCacheState {
  has_access: boolean;
  tier: 'free' | 'pro' | 'max';
  is_trial: boolean;
  is_paid: boolean;
  trial_days_remaining?: number;
  trial_expires_at?: string;
  reason?: string;
  cached_at: number; // Unix timestamp in ms
}
