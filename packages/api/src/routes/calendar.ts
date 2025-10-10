import { prisma } from '../lib/prisma.js';
import { createOAuth2Client } from '../services/google-auth.js';
import { Router } from 'express';
import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(user_id as string) },
      include: { calendars: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.google_access_token) {
      return res.status(401).json({ error: 'User not authenticated with Google' });
    }
    if (user.calendars.length === 0) {
      return res.status(404).json({
        error: 'No calendar found for this user',
        message: 'need to create a calendar first using POST /calendar',
      });
    }

    const calendarRecord = user.calendars[0];
    const client = createOAuth2Client();
    client.setCredentials({
      access_token: user.google_access_token,
      refresh_token: user.google_refresh_token,
      expiry_date: user.google_token_expires_at?.getTime(),
    });

    const calendar = google.calendar({ version: 'v3', auth: client });
    const response = await calendar.calendars.get({
      calendarId: calendarRecord.google_calendar_id,
    });

    const calendarData = response.data;
    return res.json({
      success: true,
      calendar: {
        id: calendarData.id,
        name: calendarData.summary,
        description: calendarData.description,
        timeZone: calendarData.timeZone,
      },
    });
  } catch (error) {
    console.error('Error fetching calendar:', error);
    // TODO fix error handling here as well
    return res.status(404).json({ error: 'asdf' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { user_id, name, description } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Calendar name is required' });
    }
    if (name.length > 100) {
      return res.status(400).json({ error: 'Calendar name too long (max 100 characters)' });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(user_id) },
      include: { calendars: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.google_access_token) {
      return res.status(401).json({ error: 'User not authenticated with Google' });
    }
    // TODO this is only for the MVP... later we should support multiple calendars
    if (user.calendars.length > 0) {
      return res.status(400).json({
        error: 'calendar already exists',
        message: 'user can only have 1 calendar (MVP condition)',
      });
    }

    const client = createOAuth2Client();
    client.setCredentials({
      access_token: user.google_access_token,
      refresh_token: user.google_refresh_token,
      expiry_date: user.google_token_expires_at?.getTime(),
    });
    const calendar = google.calendar({ version: 'v3', auth: client });
    const calendarData = {
      summary: name.trim(),
      description: description?.trim() || ' | created by canvas2calendar',
    };

    const response = await calendar.calendars.insert({
      requestBody: calendarData,
    });
    const createdCalendar = response.data;

    // check for against null type
    if (!createdCalendar.id) {
      return res.status(500).json({
        error: 'Failed to create calendar',
        message: 'google did not return a calendar ID',
      });
    }

    await prisma.calendar.create({
      data: {
        user_id: parseInt(user_id),
        google_calendar_id: createdCalendar.id,
        title: createdCalendar.summary || 'Untitled Calendar',
      },
    });

    return res.json({
      success: true,
      calendar: {
        id: createdCalendar.id,
        name: createdCalendar.summary,
        description: createdCalendar.description,
        created_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error creating calendar:', error);
    // TODO add detailed logging later THIS RESPONSE CODE IS RANDOM
    return res.status(404).json({ error: 'asdf' });
  }
});

router.get('/event', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(user_id as string) },
      include: { calendars: true },
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.google_access_token) {
      return res.status(401).json({ error: 'User not authenticated with Google' });
    }
    if (user.calendars.length === 0) {
      return res.status(404).json({
        error: 'No calendar found for this user',
        message: 'Need to create a calendar first using POST /calendar',
      });
    }

    const calendarRecord = user.calendars[0];

    const client = createOAuth2Client();
    client.setCredentials({
      access_token: user.google_access_token,
      refresh_token: user.google_refresh_token,
      expiry_date: user.google_token_expires_at?.getTime(),
    });

    const calendar = google.calendar({ version: 'v3', auth: client });

    const response = await calendar.events.list({
      calendarId: calendarRecord.google_calendar_id,
      maxResults: 2500,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];

    return res.json({
      success: true,
      count: events.length,
      events: events.map(event => ({
        id: event.id,
        title: event.summary,
        description: event.description,
        start: event.start,
        end: event.end,
        location: event.location,
        status: event.status,
      })),
    });
  } catch (error) {
    console.error('Error fetching events from DB', error);
    return res.status(500).json({ error: 'Failed to fetch events from DB' });
  }
});

router.post('/event', async (req, res) => {
  try {
    const { user_id, title, description, start_time, end_time, is_all_day, location, event_hash } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Event title is required' });
    }
    if (!start_time) {
      return res.status(400).json({ error: 'Start time is required' });
    }
    if (!end_time) {
      return res.status(400).json({ error: 'End time is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(user_id) },
      include: { calendars: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.google_access_token) {
      return res.status(401).json({ error: 'User not authenticated with Google' });
    }
    if (user.calendars.length === 0) {
      return res.status(404).json({
        error: 'No calendar found for this user',
        message: 'Create a calendar first using POST /calendar',
      });
    }

    const calendarRecord = user.calendars[0];
    const client = createOAuth2Client();
    client.setCredentials({
      access_token: user.google_access_token,
      refresh_token: user.google_refresh_token,
      expiry_date: user.google_token_expires_at?.getTime(),
    });

    const calendar = google.calendar({ version: 'v3', auth: client });

    const eventData = {
      summary: title.trim(),
      description: description?.trim(),
      location: location?.trim(),
      start: is_all_day
        ? { date: new Date(start_time).toISOString().split('T')[0] }
        : { dateTime: new Date(start_time).toISOString() },
      end: is_all_day
        ? { date: new Date(end_time).toISOString().split('T')[0] }
        : { dateTime: new Date(end_time).toISOString() },
    };

    const response = await calendar.events.insert({
      calendarId: calendarRecord.google_calendar_id,
      requestBody: eventData,
    });

    const createdEvent = response.data;
    if (!createdEvent || !createdEvent.id) {
      return res.status(500).json({
        error: 'Failed to create calendar event',
        message: 'Google didnt return an event id',
      });
    }

    // store data in DB
    await prisma.calendar_event.create({
      data: {
        calendar_id: calendarRecord.id,
        google_event_id: createdEvent.id,
        title: title.trim(),
        description: description?.trim(),
        start_time: new Date(start_time),
        end_time: new Date(end_time),
        is_all_day: is_all_day || false,
        location: location?.trim(),
        event_hash: event_hash,
      },
    });

    return res.json({
      success: true,
      event: {
        id: createdEvent.id,
        title: createdEvent.summary,
        description: createdEvent.description,
        start: createdEvent.start,
        end: createdEvent.end,
        location: createdEvent.location,
        created_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error creating calendar event: ', error);
    return res.status(500).json({ error: 'Failed to create calendar event' });
  }
});

router.patch('/event/:id', async (req, res) => {
  try {
    const { id: google_event_id } = req.params;
    const { user_id, title, description, start_time, end_time, is_all_day, location, event_hash } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(user_id) },
      include: { calendars: true },
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.google_access_token) {
      return res.status(401).json({ error: 'User not authenticated with Google' });
    }
    if (user.calendars.length === 0) {
      return res.status(404).json({
        error: 'No calendar found for this user',
        message: 'Create a calendar first using POST /calendar',
      });
    }

    const calendarRecord = user.calendars[0];
    const existingEvent = await prisma.calendar_event.findUnique({
      where: { google_event_id },
    });
    if (!existingEvent) {
      return res.status(404).json({ error: 'Couldnt find existing event in DB' });
    }
    if (existingEvent.calendar_id !== calendarRecord.id) {
      return res.status(403).json({ error: 'User not authorized to modify this event' });
    }

    const client = createOAuth2Client();
    client.setCredentials({
      access_token: user.google_access_token,
      refresh_token: user.google_refresh_token,
      expiry_date: user.google_token_expires_at?.getTime(),
    });

    const calendar = google.calendar({ version: 'v3', auth: client });

    // use Google's partial types to avoid any type
    const eventData: Partial<calendar_v3.Schema$Event> = {};
    if (title !== undefined) {
      eventData.summary = title.trim();
    }
    if (description !== undefined) {
      eventData.description = description?.trim();
    }
    if (location !== undefined) {
      eventData.location = location?.trim();
    }
    if (start_time || end_time || is_all_day !== undefined) {
      const useAllDay = is_all_day !== undefined ? is_all_day : existingEvent.is_all_day;
      const startTime = start_time ? new Date(start_time) : existingEvent.start_time;
      const endTime = end_time ? new Date(end_time) : existingEvent.end_time;

      if (useAllDay) {
        eventData.start = { date: startTime.toISOString().split('T')[0] };
        eventData.end = { date: endTime.toISOString().split('T')[0] };
      } else {
        eventData.start = { dateTime: startTime.toISOString() };
        eventData.end = { dateTime: endTime.toISOString() };
      }
    }

    const response = await calendar.events.patch({
      calendarId: calendarRecord.google_calendar_id,
      eventId: google_event_id,
      requestBody: eventData,
    });

    const updatedEvent = response.data;
    if (!updatedEvent) {
      return res.status(500).json({
        error: 'Failed to update calendar event',
      });
    }

    // update DB
    await prisma.calendar_event.update({
      where: { google_event_id },
      data: {
        ...(title && { title: title.trim() }),
        ...(description !== undefined && { description: description?.trim() }),
        ...(start_time && { start_time: new Date(start_time) }),
        ...(end_time && { end_time: new Date(end_time) }),
        ...(is_all_day !== undefined && { is_all_day }),
        ...(location !== undefined && { location: location?.trim() }),
        ...(event_hash && { event_hash }),
      },
    });

    return res.json({
      success: true,
      event: {
        id: updatedEvent.id,
        title: updatedEvent.summary,
        description: updatedEvent.description,
        start: updatedEvent.start,
        end: updatedEvent.end,
        location: updatedEvent.location,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error updating calendar event', error);
    return res.status(500).json({ error: 'Failed to update calendar event' });
  }
});

router.delete('/event/:id', async (req, res) => {
  try {
    const { id: google_event_id } = req.params;
    const user_id = req.query.user_id as string | undefined;
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(user_id as string) },
      include: { calendars: true },
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.google_access_token) {
      return res.status(401).json({ error: 'User not authenticated with Google' });
    }
    if (user.calendars.length === 0) {
      return res.status(404).json({
        error: 'No calendar found for this user',
        message: 'Create a calendar first using POST /calendar',
      });
    }

    const calendarRecord = user.calendars[0];

    const existingEvent = await prisma.calendar_event.findUnique({
      where: { google_event_id },
    });
    if (!existingEvent) {
      return res.status(404).json({ error: 'Event not found in DB' });
    }
    if (existingEvent.calendar_id !== calendarRecord.id) {
      return res.status(403).json({ error: 'User not authorized to modify this event' });
    }

    const client = createOAuth2Client();
    client.setCredentials({
      access_token: user.google_access_token,
      refresh_token: user.google_refresh_token,
      expiry_date: user.google_token_expires_at?.getTime(),
    });

    const calendar = google.calendar({ version: 'v3', auth: client });
    await calendar.events.delete({
      calendarId: calendarRecord.google_calendar_id,
      eventId: google_event_id,
    });

    await prisma.calendar_event.delete({
      where: { google_event_id },
    });

    return res.json({
      success: true,
      message: 'Event deleted successfully',
      event_id: google_event_id,
    });
  } catch (error) {
    console.error('Error deleting event', error);
    return res.status(500).json({ error: 'Failed to delete event' });
  }
});

export default router;
