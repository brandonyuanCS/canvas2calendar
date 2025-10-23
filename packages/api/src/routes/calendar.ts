// import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import * as CalendarService from '../services/calendar.service.js';
// import { createOAuth2Client } from '../services/google.service.js';
import { Router } from 'express';
// import { google } from 'googleapis';
// import type { calendar_v3 } from 'googleapis';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const calendar = await CalendarService.getCalendar(req.user!.id);
    return res.json({ success: true, calendar });
  } catch (error) {
    if (error instanceof Error && error.message === 'No calendar found for this user') {
      return res.status(404).json({
        error: error.message,
        message: 'Need to create a calendar first using POST /calendar',
      });
    }
    console.error('Error fetching calendar:', error);
    return res.status(500).json({ error: 'Failed to fetch calendar' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Calendar name is required' });
    }
    if (name.length > 100) {
      return res.status(400).json({ error: 'Calendar name too long (max 100 characters)' });
    }

    const calendar = await CalendarService.createCalendar(req.user!.id, { name, description });

    return res.status(201).json({
      success: true,
      calendar: {
        ...calendar,
        created_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Calendar already exists for this user') {
      return res.status(400).json({
        error: error.message,
        message: 'User can only have 1 calendar (MVP condition)',
      });
    }
    console.error('Error creating calendar:', error);
    return res.status(500).json({ error: 'Failed to create calendar' });
  }
});

router.get('/event', async (req, res) => {
  try {
    const events = await CalendarService.listEvents(req.user!.id);
    return res.json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'No calendar found for this user') {
      return res.status(404).json({
        error: error.message,
        message: 'Need to create a calendar first using POST /calendar',
      });
    }
    console.error('Error fetching events:', error);
    return res.status(500).json({ error: 'Failed to fetch events' });
  }
});

router.post('/event', async (req, res) => {
  try {
    const { title, description, start_time, end_time, is_all_day, location, event_hash } = req.body;
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Event title is required' });
    }
    if (!start_time) {
      return res.status(400).json({ error: 'Start time is required' });
    }
    if (!end_time) {
      return res.status(400).json({ error: 'End time is required' });
    }

    const event = await CalendarService.createEvent(req.user!.id, {
      title,
      description,
      start_time,
      end_time,
      is_all_day,
      location,
      event_hash,
    });

    return res.status(201).json({
      success: true,
      event: {
        ...event,
        created_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'No calendar found for this user') {
      return res.status(404).json({
        error: error.message,
        message: 'Create a calendar first using POST /calendar',
      });
    }
    console.error('Error creating event:', error);
    return res.status(500).json({ error: 'Failed to create calendar event' });
  }
});

router.patch('/event/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, start_time, end_time, is_all_day, location, event_hash } = req.body;

    const event = await CalendarService.updateEvent(req.user!.id, id, {
      title,
      description,
      start_time,
      end_time,
      is_all_day,
      location,
      event_hash,
    });

    return res.json({
      success: true,
      event: {
        ...event,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Event not found in database') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'User not authorized to modify this event') {
        return res.status(403).json({ error: error.message });
      }
      console.error('Error updating event:', error);
      return res.status(500).json({ error: 'Failed to update calendar event' });
    }
    return res.status(500).json({ error: 'Failed to update calendar event' });
  }
});

router.delete('/event/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await CalendarService.deleteEvent(req.user!.id, id);

    return res.json({
      success: true,
      message: 'Event deleted successfully',
      event_id: result.id,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Event not found in database') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'User not authorized to delete this event') {
        return res.status(403).json({ error: error.message });
      }
      console.error('Error deleting event:', error);
      return res.status(500).json({ error: 'Failed to delete event' });
    }
    return res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Sync endpoint - primary method for syncing Canvas events
router.post('/sync', async (req, res) => {
  try {
    const { ics_url } = req.body; // optional override

    const report = await CalendarService.syncCalendarFromICS(req.user!.id, ics_url);

    return res.json({
      success: true,
      report: {
        summary: {
          created: report.created.length,
          updated: report.updated.length,
          deleted: report.deleted.length,
          unchanged: report.unchanged.length,
          errors: report.errors.length,
        },
        details: {
          created: report.created,
          updated: report.updated,
          deleted: report.deleted,
          errors: report.errors,
        },
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'No ICS feed URL provided or stored for this user') {
        return res.status(400).json({
          error: error.message,
          message: 'Please provide an ics_url in the request body or set it using PUT /user/ics-url',
        });
      }
      if (error.message === 'No calendar found for this user') {
        return res.status(404).json({
          error: error.message,
          message: 'Create a calendar first using POST /calendar',
        });
      }
      console.error('Error syncing calendar:', error);
      return res.status(500).json({ error: 'Failed to sync calendar' });
    }
    return res.status(500).json({ error: 'Failed to sync calendar' });
  }
});

export default router;
