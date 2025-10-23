import ICAL from 'ical.js';

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
  eventType?: 'assignment' | 'event' | 'quiz' | 'discussion' | 'lecture';
  isAllDay: boolean;
}

export interface ParsedICS {
  events: CanvasEvent[];
  calendarName?: string;
  timezone?: string;
  lastUpdated: Date;
}

export class ICSParser {
  async fetchICS(url: string): Promise<string> {
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

      const events = vevents.map(vevent => this.parseCanvasEvent(vevent));

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
  private parseCanvasEvent(vevent: ICAL.Component): CanvasEvent {
    const event = new ICAL.Event(vevent);
    const summary = event.summary || '';
    const description = event.description || '';
    const classification = this.classifyCanvasEvent(summary, description);

    return {
      uid: event.uid,
      summary,
      description,
      dtstart: event.startDate ? event.startDate.toJSDate() : new Date(),
      dtend: event.endDate ? event.endDate.toJSDate() : new Date(),
      location: event.location || undefined,
      url: (vevent.getFirstPropertyValue('url') as string) || undefined,
      categories: (vevent.getFirstPropertyValue('categories') as string)?.split(',') || [],
      created: (vevent.getFirstPropertyValue('created') as ICAL.Time)?.toJSDate() || new Date(),
      lastModified: (vevent.getFirstPropertyValue('last-modified') as ICAL.Time)?.toJSDate() || new Date(),
      isAllDay: event.startDate ? event.startDate.isDate : false,
      ...classification,
    };
  }

  private classifyCanvasEvent(
    summary: string,
    description: string,
  ): {
    courseCode?: string;
    eventType: CanvasEvent['eventType'];
  } {
    const text = `${summary} ${description}`.toLowerCase();

    // trying to find course code - check multiple patterns
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

    // classifying event/assignment
    let eventType: CanvasEvent['eventType'] = 'event';

    if (text.includes('assignment') || text.includes('homework') || text.includes('due')) {
      eventType = 'assignment';
    } else if (text.includes('quiz') || text.includes('exam') || text.includes('test')) {
      eventType = 'quiz';
    } else if (text.includes('discussion') || text.includes('forum')) {
      eventType = 'discussion';
    } else if (text.includes('lecture') || text.includes('class') || text.includes('meeting')) {
      eventType = 'lecture';
    }

    return { courseCode, eventType };
  }
}
