import { prisma } from '../lib/prisma.js';
import { createOAuth2Client } from '../services/google-auth.js';
import { Router } from 'express';
import { google } from 'googleapis';

const router = Router();

router.post('/create', async (req, res) => {
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
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.google_access_token) {
      return res.status(401).json({ error: 'User not authenticated with Google' });
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
