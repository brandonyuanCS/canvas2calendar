/**
 * User Preferences Types
 * Cross-cutting concern types for user sync preferences
 * Used by: UI components, storage, background sync, API
 * These types define the user's sync configuration and settings
 */

export type CanvasEventType = 'assignment' | 'event';
export type TaskListNaming = 'code' | 'name' | 'combined';
export type TaskOrganization = 'per_course' | 'consolidated';

export interface SyncPreferences {
  sync?: {
    auto_sync_enabled: boolean;
    auto_sync_interval_hours: number;
  };

  calendar: {
    event_types: CanvasEventType[];
    included_courses: string[];
    color_coding_enabled: boolean;
    course_colors: Record<string, string>;
    default_calendar_id?: string;
  };

  tasks: {
    event_types: CanvasEventType[];
    included_courses: string[];
    task_list_naming: TaskListNaming;
    task_organization: TaskOrganization;
  };

  /** Custom display names for courses, keyed by course code (e.g., { "CSCE331": "Data Structures" }) */
  course_display_names?: Record<string, string>;

  data_management?: {
    date_range: {
      past_days: number;
      future_days: number;
    };
    auto_archive_completed_tasks: boolean;
    auto_archive_days?: number;
  };
}

export const DEFAULT_PREFERENCES: SyncPreferences = {
  sync: {
    auto_sync_enabled: false,
    auto_sync_interval_hours: 6,
  },
  calendar: {
    event_types: ['event'],
    included_courses: [],
    color_coding_enabled: false,
    course_colors: {},
    default_calendar_id: undefined,
  },
  tasks: {
    event_types: ['assignment'],
    included_courses: [],
    task_list_naming: 'code',
    task_organization: 'per_course',
  },
  data_management: {
    date_range: {
      past_days: 5, // Keep tasks up to 5 days overdue
      future_days: 14, // Sync tasks up to 2 weeks ahead
    },
    auto_archive_completed_tasks: false,
    auto_archive_days: 30,
  },
};
