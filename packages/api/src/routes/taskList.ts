import { prisma } from '../lib/prisma.js';
import { createOAuth2Client } from '../services/google-auth.js';
import { Router } from 'express';
import { google } from 'googleapis';
import type { tasks_v1 } from 'googleapis';

const router = Router();

// router.get('/', async (req, res) => {});

router.post('/', async (req, res) => {
  try {
    const { user_id, title } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Task list title is required' });
    }
    if (title.length > 100) {
      return res.status(400).json({ error: 'Task list title too long (max 100 characters)' });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(user_id) },
      include: { task_lists: true },
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

    const tasks = google.tasks({ version: 'v1', auth: client });

    const response = await tasks.tasklists.insert({
      requestBody: {
        title: title.trim(),
      },
    });

    const createdTaskList = response.data;
    if (!createdTaskList.id) {
      return res.status(500).json({
        error: 'Failed to create task list',
        message: 'Google didnt return task list ID',
      });
    }

    await prisma.task_list.create({
      data: {
        user_id: user.id,
        google_task_list_id: createdTaskList.id,
        title: createdTaskList.title || 'Untitled Task List',
      },
    });

    return res.json({
      success: true,
      taskList: {
        id: createdTaskList.id,
        title: createdTaskList.title,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error creating task list', error);
    return res.status(500).json({ error: 'Failed to create task list' });
  }
});

// router.patch('/:taskListId', async (req, res) => {});

// router.delete('/:taskListId', async (req, res) => {});

// router.get('/:taskListId/item', async (req, res) => {});

router.post('/:taskListId/item', async (req, res) => {
  try {
    const { taskListId: google_task_list_id } = req.params;
    const { user_id, title, notes, due_date, task_hash } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(user_id) },
      include: { task_lists: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.google_access_token) {
      return res.status(401).json({ error: 'User not authenticated with Google' });
    }

    const taskListRecord = await prisma.task_list.findUnique({
      where: { google_task_list_id },
    });
    if (!taskListRecord) {
      return res.status(404).json({ error: 'Task list not found in DB' });
    }
    if (taskListRecord.user_id !== user.id) {
      return res.status(403).json({ error: 'User not authorized to access this task list' });
    }

    const client = createOAuth2Client();
    client.setCredentials({
      access_token: user.google_access_token,
      refresh_token: user.google_refresh_token,
      expiry_date: user.google_token_expires_at?.getTime(),
    });

    const tasks = google.tasks({ version: 'v1', auth: client });

    const taskData: tasks_v1.Schema$Task = {
      title: title.trim(),
      ...(notes && { notes: notes.trim() }),
      ...(due_date && { due: new Date(due_date).toISOString() }),
    };

    const response = await tasks.tasks.insert({
      tasklist: google_task_list_id,
      requestBody: taskData,
    });

    const createdTask = response.data;

    if (!createdTask || !createdTask.id) {
      return res.status(500).json({
        error: 'Failed to create task',
        message: 'Google did not return a task ID',
      });
    }

    await prisma.task.create({
      data: {
        task_list_id: taskListRecord.id,
        google_task_id: createdTask.id,
        title: title.trim(),
        notes: notes?.trim(),
        due_date: due_date ? new Date(due_date) : null,
        task_hash: task_hash,
      },
    });

    return res.json({
      success: true,
      task: {
        id: createdTask.id,
        title: createdTask.title,
        notes: createdTask.notes,
        due: createdTask.due,
        status: createdTask.status,
        created_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error creating task', error);
    return res.status(500).json({ error: 'Failed to create task' });
  }
});

// router.patch('/:taskListId/item/:id', async (req, res) => {});

// router.delete('/:taskListId/item/:id', async (req, res) => {});

export default router;
