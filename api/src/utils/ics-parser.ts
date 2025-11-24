// @ts-expect-error - ical.js doesn't have type declarations
import ICAL from 'ical.js';
import type { CanvasEvent, ParsedICS } from '@extension/shared';

export class ICSParser {
  private static readonly FETCH_TIMEOUT_MS = 30000; // 30 seconds
  private static readonly MAX_ICS_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly MAX_EVENTS = 10000;

  async fetchICS(url: string): Promise<string> {
    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid ICS URL format');
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('URL must be HTTPS');
    }

    // Strengthened domain validation
    const canvasDomains = /^canvas\.[a-z0-9-]+\.edu$/i;
    if (!canvasDomains.test(parsed.hostname)) {
      throw new Error('URL must be Canvas domain URL');
    }

    // Additional check: ensure no subdomain tricks
    const parts = parsed.hostname.split('.');
    if (parts.length !== 3 || parts[0] !== 'canvas' || !parts[2].endsWith('edu')) {
      throw new Error('URL must be Canvas domain URL');
    }

    if (!parsed.pathname.startsWith('/feeds/calendars/user_')) {
      throw new Error('URL must be Canvas calendar URL');
    }

    // Explicit path traversal check
    if (parsed.pathname.includes('../') || parsed.pathname.includes('..\\')) {
      throw new Error('Invalid path: path traversal detected');
    }

    const valid_url = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;

    // Add timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ICSParser.FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(valid_url, {
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

  async fetchAndParse(url: string): Promise<ParsedICS> {
    const icsContent = await this.fetchICS(url);
    return this.parseICS(icsContent);
  }

  // standard ical parsing + canvas-specific classifications
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
