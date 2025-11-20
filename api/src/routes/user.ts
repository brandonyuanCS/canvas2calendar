import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { ICSParser } from '../utils/ics-parser.js';
import { DEFAULT_PREFERENCES } from '@extension/shared';
import { Router } from 'express';
import type { SyncPreferences } from '@extension/shared';
import type { Prisma } from '@prisma/client';

const router = Router();
router.use(requireAuth);

// Get user's ICS feed URL
router.get('/ics-url', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { canvas_ics_feed_url: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      success: true,
      ics_url: user.canvas_ics_feed_url,
    });
  } catch (error) {
    console.error('Error fetching ICS URL:', error);
    return res.status(500).json({ error: 'Failed to fetch ICS URL' });
  }
});

// Set or update user's ICS feed URL
router.put('/ics-url', async (req, res) => {
  try {
    const { ics_url } = req.body;

    if (!ics_url || typeof ics_url !== 'string' || ics_url.trim().length === 0) {
      return res.status(400).json({ error: 'Valid ICS URL is required' });
    }

    // Basic validation - ensure it's a URL
    try {
      new URL(ics_url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Optionally validate it's an .ics URL
    if (!ics_url.toLowerCase().endsWith('.ics')) {
      return res.status(400).json({
        error: 'URL must point to an .ics file',
        message: 'The URL should end with .ics',
      });
    }

    // Parse ICS feed to extract unique course codes
    let uniqueCourses: string[] = [];
    try {
      const parser = new ICSParser();
      const parsed = await parser.fetchAndParse(ics_url.trim());
      uniqueCourses = Array.from(
        new Set(parsed.events.map(event => event.courseCode).filter((code): code is string => Boolean(code))),
      ).sort();
    } catch (error) {
      // Re-throw validation errors (URL validation, fetch errors) - these should prevent saving
      if (error instanceof Error) {
        if (
          error.message.includes('Invalid URL') ||
          error.message.includes('URL must be') ||
          error.message.includes('Failed to fetch ICS')
        ) {
          throw error;
        }
      }
      // For other parsing errors, log and continue - all_courses will remain unchanged
      console.error('Error parsing ICS feed during URL update:', error);
    }

    // Get current user preferences
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { preferences: true },
    });
    const currentPrefs = (user?.preferences as unknown as Partial<SyncPreferences>) || {};

    // Merge with defaults and update all_courses (only if parsing succeeded)
    const updatedPreferences: SyncPreferences = {
      sync: { ...DEFAULT_PREFERENCES.sync!, ...currentPrefs.sync },
      calendar: {
        ...DEFAULT_PREFERENCES.calendar,
        ...currentPrefs.calendar,
        all_courses: uniqueCourses.length > 0 ? uniqueCourses : currentPrefs.calendar?.all_courses || [],
      },
      tasks: {
        ...DEFAULT_PREFERENCES.tasks,
        ...currentPrefs.tasks,
        all_courses: uniqueCourses.length > 0 ? uniqueCourses : currentPrefs.tasks?.all_courses || [],
      },
      data_management: {
        ...DEFAULT_PREFERENCES.data_management!,
        ...currentPrefs.data_management,
      },
    };

    // Update both ICS URL and preferences in a single transaction
    const updatedUser = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        canvas_ics_feed_url: ics_url.trim(),
        preferences: updatedPreferences as unknown as Prisma.InputJsonValue,
      },
      select: { canvas_ics_feed_url: true },
    });

    return res.json({
      success: true,
      message: 'ICS feed URL updated successfully',
      ics_url: updatedUser.canvas_ics_feed_url,
    });
  } catch (error) {
    console.error('Error updating ICS URL:', error);
    if (error instanceof Error) {
      // Return validation errors with 400 status, others with 500
      const isValidationError =
        error.message.includes('Invalid URL') ||
        error.message.includes('URL must be') ||
        error.message.includes('Failed to fetch ICS');
      return res.status(isValidationError ? 400 : 500).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to update ICS URL' });
  }
});

// Delete user's ICS feed URL
router.delete('/ics-url', async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { canvas_ics_feed_url: null },
    });

    return res.json({
      success: true,
      message: 'ICS feed URL removed successfully',
    });
  } catch (error) {
    console.error('Error deleting ICS URL:', error);
    return res.status(500).json({ error: 'Failed to delete ICS URL' });
  }
});

// Get user sync preferences
router.get('/preferences', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { preferences: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      success: true,
      preferences: user.preferences || DEFAULT_PREFERENCES,
    });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    return res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// Update user sync preferences
router.put('/preferences', async (req, res) => {
  try {
    const { preferences } = req.body;

    // Validate preferences structure
    if (!preferences) {
      return res.status(400).json({ error: 'Preferences object is required' });
    }

    // Validate calendar settings (required)
    if (!preferences.calendar) {
      return res.status(400).json({ error: 'calendar settings are required in preferences' });
    }

    if (!Array.isArray(preferences.calendar.event_types)) {
      return res.status(400).json({ error: 'calendar.event_types must be an array' });
    }

    if (!Array.isArray(preferences.calendar.included_courses)) {
      return res.status(400).json({ error: 'calendar.included_courses must be an array' });
    }

    if (!Array.isArray(preferences.calendar.all_courses)) {
      return res.status(400).json({ error: 'calendar.all_courses must be an array' });
    }

    // Validate tasks settings (required)
    if (!preferences.tasks) {
      return res.status(400).json({ error: 'tasks settings are required in preferences' });
    }

    if (!Array.isArray(preferences.tasks.event_types)) {
      return res.status(400).json({ error: 'tasks.event_types must be an array' });
    }

    if (!Array.isArray(preferences.tasks.included_courses)) {
      return res.status(400).json({ error: 'tasks.included_courses must be an array' });
    }

    if (!Array.isArray(preferences.tasks.all_courses)) {
      return res.status(400).json({ error: 'tasks.all_courses must be an array' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user!.id },
      data: { preferences },
      select: { preferences: true },
    });

    return res.json({
      success: true,
      message: 'Preferences updated successfully',
      preferences: updatedUser.preferences,
    });
  } catch (error) {
    console.error('Error updating preferences:', error);
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Get Canvas metadata (discovered courses, event types, date ranges)
// This endpoint parses the user's ICS feed to provide metadata for settings UI
router.get('/canvas-metadata', async (req, res) => {
  try {
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { canvas_ics_feed_url: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.canvas_ics_feed_url) {
      return res.status(400).json({
        error: 'No ICS feed URL configured',
        message: 'Please set your Canvas ICS feed URL first',
      });
    }

    const parser = new ICSParser();
    const parsed = await parser.fetchAndParse(user.canvas_ics_feed_url);
    const coursesMap = new Map<
      string,
      {
        code: string;
        eventCount: number;
        eventTypes: Set<string>;
      }
    >();
    const eventTypesMap = new Map<string, number>();
    let earliest = new Date();
    let latest = new Date(0);

    for (const event of parsed.events) {
      const eventType = event.eventType || 'event';

      if (event.courseCode) {
        if (!coursesMap.has(event.courseCode)) {
          coursesMap.set(event.courseCode, {
            code: event.courseCode,
            eventCount: 0,
            eventTypes: new Set(),
          });
        }
        const courseInfo = coursesMap.get(event.courseCode)!;
        courseInfo.eventCount++;
        courseInfo.eventTypes.add(eventType);
      }

      // Track event type counts
      eventTypesMap.set(eventType, (eventTypesMap.get(eventType) || 0) + 1);

      // Track date range
      if (event.dtstart < earliest) earliest = event.dtstart;
      if (event.dtstart > latest) latest = event.dtstart;
    }

    // Convert courses map to array with additional info
    const courses = Array.from(coursesMap.values()).map(course => ({
      code: course.code,
      eventCount: course.eventCount,
      eventTypes: Array.from(course.eventTypes),
    }));

    // Sort courses by event count (descending) then alphabetically
    courses.sort((a, b) => {
      if (b.eventCount !== a.eventCount) {
        return b.eventCount - a.eventCount;
      }
      return a.code.localeCompare(b.code);
    });

    return res.json({
      success: true,
      metadata: {
        courses,
        eventTypes: Object.fromEntries(eventTypesMap),
        dateRange: {
          earliest,
          latest,
        },
        totalEvents: parsed.events.length,
        calendarName: parsed.calendarName,
        lastFetched: new Date(),
      },
    });
  } catch (error) {
    console.error('Error fetching Canvas metadata:', error);

    if (error instanceof Error) {
      if (error.message.includes('fetch')) {
        return res.status(502).json({
          error: 'Failed to fetch ICS feed',
          message: 'Could not connect to Canvas. Please check your ICS URL.',
        });
      }
      if (error.message.includes('parse')) {
        return res.status(400).json({
          error: 'Failed to parse ICS feed',
          message: 'The ICS feed format is invalid or corrupted.',
        });
      }
    }

    return res.status(500).json({ error: 'Failed to fetch Canvas metadata' });
  }
});

export default router;
