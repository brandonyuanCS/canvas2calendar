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

export interface CanvasMetadata {
  courses: Array<{
    code: string;
    eventCount: number;
    eventTypes: string[];
  }>;
  eventTypes: Record<string, number>;
  dateRange: {
    earliest: string;
    latest: string;
  };
  totalEvents: number;
  calendarName?: string;
  lastFetched: string;
}
