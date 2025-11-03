export interface SyncReport {
  created: Array<{ ics_uid: string; title: string; id: string }>;
  updated: Array<{ ics_uid: string; title: string; id: string }>;
  deleted: Array<{ ics_uid: string; title: string; id: string }>;
  unchanged: Array<{ ics_uid: string; title: string }>;
  errors: Array<{ ics_uid?: string; error: string }>;
}

export interface TaskSyncReport {
  taskLists: {
    created: Array<{ title: string; id: string }>;
    existing: Array<{ title: string; id: string }>;
  };
  tasks: {
    created: Array<{ ics_uid: string; title: string; id: string; taskListTitle: string }>;
    updated: Array<{ ics_uid: string; title: string; id: string; taskListTitle: string }>;
    deleted: Array<{ ics_uid: string; title: string; id: string; taskListTitle: string }>;
    unchanged: Array<{ ics_uid: string; title: string; taskListTitle: string }>;
  };
  errors: Array<{ ics_uid?: string; courseCode?: string; error: string }>;
}

export interface CentralSyncReport {
  calendar: SyncReport;
  tasks: TaskSyncReport;
  metadata: {
    total_events_parsed: number;
    events_to_calendar: number;
    events_to_tasks: number;
    filtered_out: number;
    sync_started_at: Date;
    sync_completed_at: Date;
  };
}
