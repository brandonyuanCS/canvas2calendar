import { prisma } from '../lib/prisma.js';
import { createOAuth2Client } from '../services/google-auth.js';
import { Router } from 'express';
import { google } from 'googleapis';

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

export default router;
