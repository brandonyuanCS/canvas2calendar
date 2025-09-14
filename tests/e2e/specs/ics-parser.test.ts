/* eslint-disable */
import { ICSParser } from '../../../packages/ics-parsing/ics-parser.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
// import type { CanvasEvent } from '../../../packages/shared/types.js';

// Mock fetch for testing
global.fetch = vi.fn();

describe('ICSParser', () => {
  let parser: ICSParser;

  beforeEach(() => {
    parser = new ICSParser();
    vi.clearAllMocks();
  });

  describe('fetchICS', () => {
    it('should fetch ICS content successfully', async () => {
      const mockIcsContent = 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR';
      
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/calendar']]),
        text: () => Promise.resolve(mockIcsContent)
      });

      const result = await parser.fetchICS('https://example.com/calendar.ics');
      
      expect(result).toBe(mockIcsContent);
      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/calendar.ics',
        {
          headers: {
            'Accept': 'text/calendar,text/plain,*/*',
            'User-Agent': 'canvas2calendar-extension/1.0'
          }
        }
      );
    });

    it('should throw error on HTTP failure', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(parser.fetchICS('https://example.com/nonexistent.ics'))
        .rejects
        .toThrow('HTTP 404: Not Found');
    });

    it('should throw error on network failure', async () => {
      (fetch as any).mockRejectedValueOnce(new Error('Network error'));

      await expect(parser.fetchICS('https://example.com/calendar.ics'))
        .rejects
        .toThrow('Failed to fetch ICS: Network error');
    });
  });

  describe('parseICS', () => {
    it('should parse a simple Canvas assignment event', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Canvas//Canvas//EN
X-WR-CALNAME:CS101 - Introduction to Programming
X-WR-TIMEZONE:America/Chicago
BEGIN:VEVENT
UID:event-assignment-123@canvas.university.edu
DTSTART:20240315T235900Z
DTEND:20240315T235900Z
SUMMARY:CS101 Assignment 1 due
DESCRIPTION:Complete the programming assignment on arrays and loops
LOCATION:Online
URL:https://canvas.university.edu/courses/123/assignments/456
CATEGORIES:ASSIGNMENT
CREATED:20240301T120000Z
LAST-MODIFIED:20240301T120000Z
END:VEVENT
END:VCALENDAR`;

      const result = parser.parseICS(icsContent);

      expect(result.calendarName).toBe('CS101 - Introduction to Programming');
      expect(result.timezone).toBe('America/Chicago');
      expect(result.events).toHaveLength(1);

      const event = result.events[0];
      expect(event.uid).toBe('event-assignment-123@canvas.university.edu');
      expect(event.summary).toBe('CS101 Assignment 1 due');
      expect(event.description).toBe('Complete the programming assignment on arrays and loops');
      expect(event.courseCode).toBe('CS101');
      expect(event.eventType).toBe('assignment');
      expect(event.dtstart).toBeInstanceOf(Date);
      expect(event.location).toBe('Online');
      expect(event.url).toBe('https://canvas.university.edu/courses/123/assignments/456');
    });

    it('should parse a Canvas quiz event', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:quiz-456@canvas.university.edu
DTSTART:20240320T140000Z
DTEND:20240320T153000Z
SUMMARY:MATH240 Midterm Exam
DESCRIPTION:Midterm exam covering chapters 1-5
CREATED:20240301T120000Z
LAST-MODIFIED:20240301T120000Z
END:VEVENT
END:VCALENDAR`;

      const result = parser.parseICS(icsContent);
      const event = result.events[0];

      expect(event.courseCode).toBe('MATH240');
      expect(event.eventType).toBe('quiz');
      expect(event.summary).toBe('MATH240 Midterm Exam');
    });

    it('should parse a Canvas lecture event', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:lecture-789@canvas.university.edu
DTSTART:20240318T090000Z
DTEND:20240318T105000Z
SUMMARY:BIO101 Lecture: Cell Structure
DESCRIPTION:Introduction to cellular biology and organelles
CREATED:20240301T120000Z
LAST-MODIFIED:20240301T120000Z
END:VEVENT
END:VCALENDAR`;

      const result = parser.parseICS(icsContent);
      const event = result.events[0];

      expect(event.courseCode).toBe('BIO101');
      expect(event.eventType).toBe('lecture');
      expect(event.summary).toBe('BIO101 Lecture: Cell Structure');
    });

    it('should parse a Canvas discussion event', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:discussion-101@canvas.university.edu
DTSTART:20240319T120000Z
DTEND:20240319T120000Z
SUMMARY:ENG202 Discussion Forum: Poetry Analysis
DESCRIPTION:Participate in the discussion about modern poetry
CREATED:20240301T120000Z
LAST-MODIFIED:20240301T120000Z
END:VEVENT
END:VCALENDAR`;

      const result = parser.parseICS(icsContent);
      const event = result.events[0];

      expect(event.courseCode).toBe('ENG202');
      expect(event.eventType).toBe('discussion');
    });

    it('should handle events without course codes', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:general-event@canvas.university.edu
DTSTART:20240322T100000Z
DTEND:20240322T110000Z
SUMMARY:Campus Event: Career Fair
DESCRIPTION:Annual career fair in the student center
CREATED:20240301T120000Z
LAST-MODIFIED:20240301T120000Z
END:VEVENT
END:VCALENDAR`;

      const result = parser.parseICS(icsContent);
      const event = result.events[0];

      expect(event.courseCode).toBeUndefined();
      expect(event.eventType).toBe('event');
      expect(event.summary).toBe('Campus Event: Career Fair');
    });

    it('should handle multiple events', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:assignment-1@canvas.university.edu
DTSTART:20240315T235900Z
DTEND:20240315T235900Z
SUMMARY:CS101 Assignment 1 due
DESCRIPTION:Programming assignment
CREATED:20240301T120000Z
LAST-MODIFIED:20240301T120000Z
END:VEVENT
BEGIN:VEVENT
UID:lecture-1@canvas.university.edu
DTSTART:20240316T090000Z
DTEND:20240316T105000Z
SUMMARY:CS101 Lecture: Variables
DESCRIPTION:Introduction to variables
CREATED:20240301T120000Z
LAST-MODIFIED:20240301T120000Z
END:VEVENT
END:VCALENDAR`;

      const result = parser.parseICS(icsContent);

      expect(result.events).toHaveLength(2);
      expect(result.events[0].eventType).toBe('assignment');
      expect(result.events[1].eventType).toBe('lecture');
    });

    it('should handle all-day events', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:all-day@canvas.university.edu
DTSTART;VALUE=DATE:20240320
DTEND;VALUE=DATE:20240321
SUMMARY:HIST101 Research Paper Due
DESCRIPTION:Final research paper submission
CREATED:20240301T120000Z
LAST-MODIFIED:20240301T120000Z
END:VEVENT
END:VCALENDAR`;

      const result = parser.parseICS(icsContent);
      const event = result.events[0];

      expect(event.isAllDay).toBe(true);
      expect(event.eventType).toBe('assignment');
    });

    it('should throw error for invalid ICS format', () => {
      const invalidIcs = 'This is not an ICS file';

      expect(() => parser.parseICS(invalidIcs))
        .toThrow('ICS parsing failed');
    });
  });

  describe('fetchAndParse integration', () => {
    it('should fetch and parse in one operation', async () => {
      const mockIcsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:test-event@canvas.university.edu
DTSTART:20240315T120000Z
DTEND:20240315T130000Z
SUMMARY:CS101 Test Event
DESCRIPTION:Test description
CREATED:20240301T120000Z
LAST-MODIFIED:20240301T120000Z
END:VEVENT
END:VCALENDAR`;

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockIcsContent)
      });

      const result = await parser.fetchAndParse('https://example.com/calendar.ics');

      expect(result.events).toHaveLength(1);
      expect(result.events[0].summary).toBe('CS101 Test Event');
      expect(result.events[0].courseCode).toBe('CS101');
      expect(result.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('Edge Cases', () => {
    it('should handle course codes with different formats', () => {
      const testCases = [
        { summary: 'CS-101 Assignment', expected: 'CS101' },
        { summary: 'MATH 240 Quiz', expected: 'MATH240' },
        { summary: 'BIO1234A Lab Report', expected: 'BIO1234A' },
        { summary: 'ENGL101 Essay', expected: 'ENGL101' }
      ];

      testCases.forEach(({ summary, expected }) => {
        const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:test@canvas.edu
DTSTART:20240315T120000Z
DTEND:20240315T130000Z
SUMMARY:${summary}
DESCRIPTION:Test
CREATED:20240301T120000Z
LAST-MODIFIED:20240301T120000Z
END:VEVENT
END:VCALENDAR`;

        const result = parser.parseICS(icsContent);
        expect(result.events[0].courseCode).toBe(expected);
      });
    });

    it('should handle events with missing optional fields', () => {
      const minimalIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:minimal@canvas.edu
DTSTART:20240315T120000Z
DTEND:20240315T130000Z
SUMMARY:Minimal Event
END:VEVENT
END:VCALENDAR`;

      const result = parser.parseICS(minimalIcs);
      const event = result.events[0];

      expect(event.description).toBe('');
      expect(event.location).toBeUndefined();
      expect(event.url).toBeUndefined();
      expect(event.categories).toEqual([]);
    });

    it('should handle empty calendar', () => {
      const emptyIcs = `BEGIN:VCALENDAR
VERSION:2.0
END:VCALENDAR`;

      const result = parser.parseICS(emptyIcs);
      expect(result.events).toHaveLength(0);
    });
  });
});