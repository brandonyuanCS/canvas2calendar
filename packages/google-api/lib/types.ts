/**
 * Google API Types (Domain-Specific)
 * Type definitions for Google Calendar and Tasks API responses
 *
 * Ownership: @extension/google-api package
 * These types are specific to Google API interactions and should not be moved to shared
 */

// ============= Calendar API Types =============

export interface GoogleEvent {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: {
    date?: string; // For all-day events (YYYY-MM-DD)
    dateTime?: string; // For timed events (ISO 8601)
    timeZone?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  status?: string;
  extendedProperties?: {
    private?: Record<string, string>;
  };
}

export interface GoogleCalendar {
  id?: string;
  summary?: string;
  description?: string;
  timeZone?: string;
}

export interface GoogleEventList {
  items: GoogleEvent[];
  nextPageToken?: string;
}

// ============= Tasks API Types =============

export interface GoogleTask {
  id?: string;
  title?: string;
  notes?: string;
  due?: string; // RFC 3339 timestamp
  status?: 'needsAction' | 'completed';
  completed?: string;
}

export interface GoogleTaskList {
  id?: string;
  title?: string;
  updated?: string;
}

export interface GoogleTaskListResponse {
  items: GoogleTaskList[];
  nextPageToken?: string;
}

export interface GoogleTaskResponse {
  items: GoogleTask[];
  nextPageToken?: string;
}

// ============= Auth Types =============

export interface GoogleUserInfo {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

// ============= Error Types =============

export interface GoogleApiError {
  error: {
    code: number;
    message: string;
    errors?: Array<{ message: string; domain: string; reason: string }>;
  };
}
