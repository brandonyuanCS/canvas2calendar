/**
 * Google Calendar API Client
 * Lightweight fetch-based wrapper for Calendar v3 API
 */

import { googleFetch } from './auth.js';
import type { GoogleEvent, GoogleCalendar, GoogleEventList } from './types.js';

const CALENDAR_BASE_URL = 'https://www.googleapis.com/calendar/v3';

/**
 * Google Calendar API methods
 */
export const CalendarAPI = {
  /**
   * Create a new calendar
   */
  async createCalendar(calendar: GoogleCalendar): Promise<GoogleCalendar> {
    return googleFetch<GoogleCalendar>(`${CALENDAR_BASE_URL}/calendars`, {
      method: 'POST',
      body: JSON.stringify(calendar),
    });
  },

  /**
   * Get a calendar by ID
   */
  async getCalendar(calendarId: string): Promise<GoogleCalendar> {
    return googleFetch<GoogleCalendar>(`${CALENDAR_BASE_URL}/calendars/${encodeURIComponent(calendarId)}`);
  },

  /**
   * Update a calendar
   */
  async updateCalendar(calendarId: string, calendar: Partial<GoogleCalendar>): Promise<GoogleCalendar> {
    return googleFetch<GoogleCalendar>(`${CALENDAR_BASE_URL}/calendars/${encodeURIComponent(calendarId)}`, {
      method: 'PATCH',
      body: JSON.stringify(calendar),
    });
  },

  /**
   * Delete a calendar
   */
  async deleteCalendar(calendarId: string): Promise<void> {
    await googleFetch<void>(`${CALENDAR_BASE_URL}/calendars/${encodeURIComponent(calendarId)}`, { method: 'DELETE' });
  },

  /**
   * List events in a calendar
   */
  async listEvents(
    calendarId: string,
    options?: {
      maxResults?: number;
      singleEvents?: boolean;
      orderBy?: 'startTime' | 'updated';
      timeMin?: string;
      timeMax?: string;
      pageToken?: string;
    },
  ): Promise<GoogleEventList> {
    const params = new URLSearchParams();
    if (options?.maxResults) params.set('maxResults', options.maxResults.toString());
    if (options?.singleEvents) params.set('singleEvents', 'true');
    if (options?.orderBy) params.set('orderBy', options.orderBy);
    if (options?.timeMin) params.set('timeMin', options.timeMin);
    if (options?.timeMax) params.set('timeMax', options.timeMax);
    if (options?.pageToken) params.set('pageToken', options.pageToken);

    const url = `${CALENDAR_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    return googleFetch<GoogleEventList>(url);
  },

  /**
   * Get a single event
   */
  async getEvent(calendarId: string, eventId: string): Promise<GoogleEvent> {
    return googleFetch<GoogleEvent>(
      `${CALENDAR_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    );
  },

  /**
   * Create an event
   */
  async createEvent(calendarId: string, event: GoogleEvent): Promise<GoogleEvent> {
    return googleFetch<GoogleEvent>(`${CALENDAR_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify(event),
    });
  },

  /**
   * Update an event (PATCH - partial update)
   */
  async updateEvent(calendarId: string, eventId: string, event: Partial<GoogleEvent>): Promise<GoogleEvent> {
    return googleFetch<GoogleEvent>(
      `${CALENDAR_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(event),
      },
    );
  },

  /**
   * Delete an event
   */
  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await googleFetch<void>(
      `${CALENDAR_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' },
    );
  },
};
