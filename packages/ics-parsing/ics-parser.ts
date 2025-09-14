import ICAL from 'ical.js';
import type { CanvasEvent, ParsedICS } from '../shared/types';

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
      throw new Error(`HTTP ${error}`);
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
  private parseCanvasEvent(vevent): CanvasEvent {
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
      url: vevent.getFirstPropertyValue('url') || undefined,
      categories: vevent.getFirstPropertyValue('categories')?.split(',') || [],
      created: vevent.getFirstPropertyValue('created')?.toJSDate() || new Date(),
      lastModified: vevent.getFirstPropertyValue('last-modified')?.toJSDate() || new Date(),
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

    // trying to find course code
    const courseMatch = summary.match(/^([A-Z]{2,4}[-\s]?\d{3,4}[A-Z]?)/);
    const courseCode = courseMatch ? courseMatch[1].replace(/[-\s]/g, '') : undefined;

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
