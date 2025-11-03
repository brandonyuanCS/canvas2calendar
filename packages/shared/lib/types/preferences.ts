export type CanvasEventType = 'assignment' | 'event';
export type TaskListNaming = 'code' | 'name' | 'combined';
export type TaskOrganization = 'per_course' | 'consolidated';

export interface SyncPreferences {
  sync?: {
    auto_sync_enabled: boolean;
    auto_sync_interval_hours: number;
    sync_on_startup: boolean;
    initial_sync_past_days: number;
  };

  calendar: {
    event_types: CanvasEventType[];
    included_courses: string[];
    excluded_courses: string[];
    color_coding_enabled: boolean;
    course_colors: Record<string, string>;
    default_calendar_id?: string;
  };

  tasks: {
    event_types: CanvasEventType[];
    included_courses: string[];
    excluded_courses: string[];
    task_list_naming: TaskListNaming;
    task_organization: TaskOrganization;
  };

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
    sync_on_startup: false,
    initial_sync_past_days: 0,
  },
  calendar: {
    event_types: ['event'],
    included_courses: [],
    excluded_courses: [],
    color_coding_enabled: false,
    course_colors: {},
    default_calendar_id: undefined,
  },
  tasks: {
    event_types: ['assignment'],
    included_courses: [],
    excluded_courses: [],
    task_list_naming: 'code',
    task_organization: 'per_course',
  },
  data_management: {
    date_range: {
      past_days: 0,
      future_days: 365,
    },
    auto_archive_completed_tasks: false,
    auto_archive_days: 30,
  },
};
