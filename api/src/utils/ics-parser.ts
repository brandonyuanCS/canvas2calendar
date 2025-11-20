// @ts-expect-error - ical.js doesn't have type declarations
import ICAL from 'ical.js';
import type { CanvasEvent, ParsedICS } from '@extension/shared';

export class ICSParser {
  async fetchICS(url: string): Promise<string> {
    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch (error) {
      throw new Error(`Invalid URL, ${error}`);
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('URL must be HTTPS');
    }
    const canvasDomains = /canvas\.[a-z0-9-]+\.edu$/i;
    if (!canvasDomains.test(parsed.hostname)) {
      throw new Error('URL must be Canvas domain URL');
    }
    if (!parsed.pathname.startsWith('/feeds/calendars/user_')) {
      throw new Error('URL must be Canvas calendar URL');
    }

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'text/calendar,text/plain,*/*',
          'User-Agent': 'canvas2calendar-extension/1.0',
        },
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return await response.text();
    } catch (error) {
      throw new Error(`Failed to fetch ICS: ${error}`);
    }
  }

  parseICS(icsContent: string): ParsedICS {
    try {
      const jcalData = ICAL.parse(icsContent);
      const comp = new ICAL.Component(jcalData);
      const vevents = comp.getAllSubcomponents('vevent');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const events = vevents.map((vevent: any) => this.parseCanvasEvent(vevent));

      return {
        events,
        calendarName: (comp.getFirstPropertyValue('x-wr-calname') as string) || undefined,
        timezone: (comp.getFirstPropertyValue('x-wr-timezone') as string) || undefined,
        lastUpdated: new Date(),
      };
    } catch (error) {
      throw new Error(`ICS parsing failed: ${error}`);
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
