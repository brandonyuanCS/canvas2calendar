import { requireAuth } from '../middleware/auth.middleware.js';
import * as CalendarService from '../services/calendar.service.js';
import { Router } from 'express';

const router = Router();
router.use(requireAuth);

// Get calendar info
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

// Create calendar
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

// List events (for debugging)
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

export default router;
