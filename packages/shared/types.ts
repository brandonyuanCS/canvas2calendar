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
  // fields we will parse later
  courseCode?: string;
  eventType?: 'assignment' | 'event' | 'quiz' | 'discussion' | 'lecture';
  isAllDay: boolean;
}

export interface ParsedICS {
  events: CanvasEvent[];
  calendarName?: string;
  timezone?: string;
  lastUpdated: Date;
}
