/**
 * ICS Parser for Canvas Calendar Feeds
 * Parses ICS/iCalendar format and extracts Canvas-specific event data
 */

import { validateCanvasUrl } from './validator.js';
import ICAL from 'ical.js';
import type { CanvasEvent, ParsedICS } from '@extension/shared';

export class ICSParser {
  private static readonly FETCH_TIMEOUT_MS = 30000; // 30 seconds
  private static readonly MAX_ICS_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly MAX_EVENTS = 10000;

  /**
   * Fetch ICS content from a Canvas URL
   * Note: Requires host_permissions for the Canvas domain in manifest.json
   */
  async fetchICS(url: string): Promise<string> {
    const validation = validateCanvasUrl(url);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid ICS URL');
    }

    const parsed = new URL(url);
    const validUrl = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;

    // Add timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ICSParser.FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(validUrl, {
        signal: controller.signal,
        headers: {
          Accept: 'text/calendar,text/plain,*/*',
          'User-Agent': 'canvas2calendar-extension/1.0',
        },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('Failed to fetch ICS feed');
      }

      // Check Content-Length header if available
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > ICSParser.MAX_ICS_SIZE) {
        throw new Error('ICS file too large');
      }

      const text = await response.text();

      // Verify actual size
      if (text.length > ICSParser.MAX_ICS_SIZE) {
        throw new Error('ICS file too large');
      }

      return text;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout: ICS feed took too long to respond');
      }
      // Don't expose internal error details
      throw new Error('Failed to fetch ICS feed');
    }
  }

  /**
   * Parse ICS content into structured events
   */
  parseICS(icsContent: string): ParsedICS {
    // Limit input size before parsing
    if (icsContent.length > ICSParser.MAX_ICS_SIZE) {
      throw new Error('ICS file exceeds maximum size');
    }

    try {
      const jcalData = ICAL.parse(icsContent);
      const comp = new ICAL.Component(jcalData);
      const vevents = comp.getAllSubcomponents('vevent');

      // Limit number of events to prevent DoS
      if (vevents.length > ICSParser.MAX_EVENTS) {
        throw new Error(`Too many events in ICS file (max ${ICSParser.MAX_EVENTS})`);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const events = vevents.map((vevent: any) => this.parseCanvasEvent(vevent));

      return {
        events,
        calendarName: (comp.getFirstPropertyValue('x-wr-calname') as string) || undefined,
        timezone: (comp.getFirstPropertyValue('x-wr-timezone') as string) || undefined,
        lastUpdated: new Date(),
      };
    } catch {
      // Don't leak internal error details
      throw new Error('ICS parsing failed: invalid file format');
    }
  }

  /**
   * Fetch and parse in one call
   */
  async fetchAndParse(url: string): Promise<ParsedICS> {
    const icsContent = await this.fetchICS(url);
    return this.parseICS(icsContent);
  }

  /**
   * Parse a single VEVENT component into a CanvasEvent
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseCanvasEvent(vevent: any): CanvasEvent {
    const event = new ICAL.Event(vevent);
    const uid = event.uid;
    const originalSummary = event.summary || '';
    const description = event.description || '';
    const classification = this.classifyCanvasEvent(uid, originalSummary);

    // Remove course code from summary
    let summary = originalSummary;

    // Pattern 1: Remove course code at the start (e.g., "CSCE 331 - Assignment" -> "Assignment")
    summary = summary.replace(/^[A-Z]{2,4}[-\s]?\d{3,4}[A-Z]?\s*-\s*/, '');

    // Pattern 2: Remove course code in brackets at the end (e.g., "Assignment [CSCE-331:916,970]" -> "Assignment")
    summary = summary.replace(/\s*\[[A-Z]{2,4}[-\s]?\d{3,4}[A-Z]?[^\]]*\]\s*$/, '');

    // Clean up any extra whitespace
    summary = summary.trim();

    return {
      uid,
      summary,
      description,
      dtstart: event.startDate ? event.startDate.toJSDate() : new Date(),
      dtend: event.endDate ? event.endDate.toJSDate() : new Date(),
      location: event.location || undefined,
      url: (vevent.getFirstPropertyValue('url') as string) || undefined,
      categories: (vevent.getFirstPropertyValue('categories') as string)?.split(',') || [],
      created: (vevent.getFirstPropertyValue('created') as { toJSDate(): Date })?.toJSDate() || new Date(),
      lastModified: (vevent.getFirstPropertyValue('last-modified') as { toJSDate(): Date })?.toJSDate() || new Date(),
      isAllDay: event.startDate ? event.startDate.isDate : false,
      ...classification,
    };
  }

  /**
   * Classify Canvas events based on UID patterns
   */
  private classifyCanvasEvent(
    uid: string,
    summary: string,
  ): {
    courseCode?: string;
    eventType: CanvasEvent['eventType'];
  } {
    // Extract course code from summary
    let courseCode: string | undefined;

    // Pattern 1: At the start (e.g., "CSCE 331 - Assignment")
    let courseMatch = summary.match(/^([A-Z]{2,4}[-\s]?\d{3,4}[A-Z]?)/);
    if (courseMatch) {
      courseCode = courseMatch[1].replace(/[-\s]/g, '');
    } else {
      // Pattern 2: In brackets at the end (e.g., "Assignment [CSCE-331:916,970]")
      courseMatch = summary.match(/\[([A-Z]{2,4})[-\s]?(\d{3,4}[A-Z]?)/);
      if (courseMatch) {
        courseCode = courseMatch[1] + courseMatch[2];
      }
    }

    // Classify event type based on Canvas UID (100% reliable)
    // Canvas UIDs follow the pattern:
    // - 'event-assignment-*' → All graded work (assignments, quizzes, discussions, etc.)
    // - 'event-calendar-event-*' → Calendar events (seminars, meetings, office hours, etc.)
    // - 'event-assignment-override-*' → Personalized due dates (still an assignment)
    let eventType: CanvasEvent['eventType'] = 'event';

    if (uid.includes('assignment')) {
      eventType = 'assignment';
    } else if (uid.includes('calendar-event')) {
      eventType = 'event';
    }

    return { courseCode, eventType };
  }
}

/**
 * Singleton instance for convenience
 */
export const icsParser = new ICSParser();
