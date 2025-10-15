import * as GoogleService from './google.service.js';
import { prisma } from '../lib/prisma.js';
import type { calendar_v3 } from 'googleapis';

// helpers
const getUserAndCalendar = async (userId: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { calendars: true },
  });
  if (!user) {
    throw new Error('User not found');
  }
  if (!user.google_access_token) {
    throw new Error('User not authenticated with Google');
  }
  if (user.calendars.length === 0) {
    throw new Error('No calendar found for this user');
  }

  const calendarRecord = user.calendars[0];
  return { user, calendarRecord };
};

// exported functions
export const createCalendar = async (userId: number, calendarData: { name: string; description?: string }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { calendars: true },
  });

  if (!user) {
    throw new Error('User not found');
  }
  if (!user.google_access_token) {
    throw new Error('User not authenticated with Google');
  }
  // MVP constraint
  if (user.calendars.length > 0) {
    throw new Error('Calendar already exists for this user');
  }

  const calendarClient = GoogleService.getGoogleCalendarClient({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
    expiry_date: user.google_token_expires_at?.getTime(),
  });

  const requestBody: calendar_v3.Schema$Calendar = {
    summary: calendarData.name.trim(),
    description: calendarData.description?.trim() || ' | created by canvas2calendar',
  };

  const response = await calendarClient.calendars.insert({ requestBody });
  const createdCalendar = response.data;

  if (!createdCalendar.id) {
    throw new Error('Failed to create calendar: Google did not return a calendar ID');
  }

  await prisma.calendar.create({
    data: {
      user_id: userId,
      google_calendar_id: createdCalendar.id,
      title: createdCalendar.summary || 'Untitled Calendar',
    },
  });

  return {
    id: createdCalendar.id,
    name: createdCalendar.summary,
    description: createdCalendar.description,
  };
};

export const getCalendar = async (userId: number) => {
  const { user, calendarRecord } = await getUserAndCalendar(userId);

  const calendarClient = GoogleService.getGoogleCalendarClient({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
    expiry_date: user.google_token_expires_at?.getTime(),
  });

  const response = await calendarClient.calendars.get({
    calendarId: calendarRecord.google_calendar_id,
  });

  return {
    id: response.data.id,
    name: response.data.summary,
    description: response.data.description,
    timeZone: response.data.timeZone,
  };
};

export const listEvents = async (userId: number) => {
  const { user, calendarRecord } = await getUserAndCalendar(userId);

  const calendarClient = GoogleService.getGoogleCalendarClient({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
    expiry_date: user.google_token_expires_at?.getTime(),
  });

  const response = await calendarClient.events.list({
    calendarId: calendarRecord.google_calendar_id,
    maxResults: 2500,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return (response.data.items || []).map(event => ({
    id: event.id,
    title: event.summary,
    description: event.description,
    start: event.start,
    end: event.end,
    location: event.location,
    status: event.status,
  }));
};

export const createEvent = async (
  userId: number,
  eventData: {
    title: string;
    description?: string;
    start_time: string;
    end_time: string;
    is_all_day?: boolean;
    location?: string;
    event_hash?: string;
  },
) => {
  const { user, calendarRecord } = await getUserAndCalendar(userId);

  const calendarClient = GoogleService.getGoogleCalendarClient({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
    expiry_date: user.google_token_expires_at?.getTime(),
  });

  const googleEventData = {
    summary: eventData.title.trim(),
    description: eventData.description?.trim(),
    location: eventData.location?.trim(),
    start: eventData.is_all_day
      ? { date: new Date(eventData.start_time).toISOString().split('T')[0] }
      : { dateTime: new Date(eventData.start_time).toISOString() },
    end: eventData.is_all_day
      ? { date: new Date(eventData.end_time).toISOString().split('T')[0] }
      : { dateTime: new Date(eventData.end_time).toISOString() },
  };

  const response = await calendarClient.events.insert({
    calendarId: calendarRecord.google_calendar_id,
    requestBody: googleEventData,
  });

  const createdEvent = response.data;
  if (!createdEvent?.id) {
    throw new Error('Google did not return an event ID');
  }

  // Store in DB
  await prisma.calendar_event.create({
    data: {
      calendar_id: calendarRecord.id,
      google_event_id: createdEvent.id,
      title: eventData.title.trim(),
      description: eventData.description?.trim(),
      start_time: new Date(eventData.start_time),
      end_time: new Date(eventData.end_time),
      is_all_day: eventData.is_all_day || false,
      location: eventData.location?.trim(),
      event_hash: eventData.event_hash,
    },
  });

  return {
    id: createdEvent.id,
    title: createdEvent.summary,
    description: createdEvent.description,
    start: createdEvent.start,
    end: createdEvent.end,
    location: createdEvent.location,
  };
};

export const updateEvent = async (
  userId: number,
  googleEventId: string,
  updates: {
    title?: string;
    description?: string;
    start_time?: string;
    end_time?: string;
    is_all_day?: boolean;
    location?: string;
    event_hash?: string;
  },
) => {
  const { user, calendarRecord } = await getUserAndCalendar(userId);

  const existingEvent = await prisma.calendar_event.findUnique({
    where: { google_event_id: googleEventId },
  });

  if (!existingEvent) {
    throw new Error('Event not found in database');
  }

  if (existingEvent.calendar_id !== calendarRecord.id) {
    throw new Error('User not authorized to modify this event');
  }

  const calendarClient = GoogleService.getGoogleCalendarClient({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
    expiry_date: user.google_token_expires_at?.getTime(),
  });

  const eventData: Partial<calendar_v3.Schema$Event> = {};

  if (updates.title !== undefined) {
    eventData.summary = updates.title.trim();
  }
  if (updates.description !== undefined) {
    eventData.description = updates.description?.trim();
  }
  if (updates.location !== undefined) {
    eventData.location = updates.location?.trim();
  }
  if (updates.start_time || updates.end_time || updates.is_all_day !== undefined) {
    const useAllDay = updates.is_all_day !== undefined ? updates.is_all_day : existingEvent.is_all_day;
    const startTime = updates.start_time ? new Date(updates.start_time) : existingEvent.start_time;
    const endTime = updates.end_time ? new Date(updates.end_time) : existingEvent.end_time;

    if (useAllDay) {
      eventData.start = { date: startTime.toISOString().split('T')[0] };
      eventData.end = { date: endTime.toISOString().split('T')[0] };
    } else {
      eventData.start = { dateTime: startTime.toISOString() };
      eventData.end = { dateTime: endTime.toISOString() };
    }
  }

  const response = await calendarClient.events.patch({
    calendarId: calendarRecord.google_calendar_id,
    eventId: googleEventId,
    requestBody: eventData,
  });

  const updatedEvent = response.data;
  if (!updatedEvent) {
    throw new Error('Failed to update event in Google Calendar');
  }

  // update DB
  await prisma.calendar_event.update({
    where: { google_event_id: googleEventId },
    data: {
      ...(updates.title && { title: updates.title.trim() }),
      ...(updates.description !== undefined && { description: updates.description?.trim() }),
      ...(updates.start_time && { start_time: new Date(updates.start_time) }),
      ...(updates.end_time && { end_time: new Date(updates.end_time) }),
      ...(updates.is_all_day !== undefined && { is_all_day: updates.is_all_day }),
      ...(updates.location !== undefined && { location: updates.location?.trim() }),
      ...(updates.event_hash && { event_hash: updates.event_hash }),
    },
  });

  return {
    id: updatedEvent.id,
    title: updatedEvent.summary,
    description: updatedEvent.description,
    start: updatedEvent.start,
    end: updatedEvent.end,
    location: updatedEvent.location,
  };
};

export const deleteEvent = async (userId: number, googleEventId: string) => {
  const { user, calendarRecord } = await getUserAndCalendar(userId);

  const existingEvent = await prisma.calendar_event.findUnique({
    where: { google_event_id: googleEventId },
  });

  if (!existingEvent) {
    throw new Error('Event not found in database');
  }

  if (existingEvent.calendar_id !== calendarRecord.id) {
    throw new Error('User not authorized to delete this event');
  }

  const calendarClient = GoogleService.getGoogleCalendarClient({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
    expiry_date: user.google_token_expires_at?.getTime(),
  });

  await calendarClient.events.delete({
    calendarId: calendarRecord.google_calendar_id,
    eventId: googleEventId,
  });

  await prisma.calendar_event.delete({
    where: { google_event_id: googleEventId },
  });

  return { id: googleEventId };
};
