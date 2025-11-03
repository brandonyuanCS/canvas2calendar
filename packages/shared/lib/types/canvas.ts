// Canvas event and ICS parsing types (shared)

export interface CanvasEvent {
  uid: string;
  summary: string;
  description: string;
  dtstart: Date;
  dtend: Date;
  location?: string;
  url?: string;
  categories: string[];
  created: Date;
  lastModified: Date;
  courseCode?: string;
  eventType: 'assignment' | 'event';
  isAllDay: boolean;
}

export interface ParsedICS {
  events: CanvasEvent[];
  calendarName?: string;
  timezone?: string;
  lastUpdated: Date;
}
