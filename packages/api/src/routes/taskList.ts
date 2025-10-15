import { requireAuth } from '../middleware/auth.middleware.js';
import * as TaskListService from '../services/taskList.service.js';
import { Router } from 'express';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const taskLists = await TaskListService.listTaskLists(req.user!.id);
    return res.json({
      success: true,
      count: taskLists.length,
      taskLists,
    });
  } catch (error) {
    console.error('Error fetching task lists:', error);
    return res.status(500).json({ error: 'Failed to fetch task lists' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { title } = req.body;

    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Task list title is required' });
    }
    if (title.length > 100) {
      return res.status(400).json({ error: 'Task list title too long (max 100 characters)' });
    }

    const taskList = await TaskListService.createTaskList(req.user!.id, { title });

    return res.status(201).json({
      success: true,
      taskList: {
        ...taskList,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error creating task list:', error);
    return res.status(500).json({ error: 'Failed to create task list' });
  }
});

router.patch('/:taskListId', async (req, res) => {
  try {
    const { taskListId } = req.params;
    const { title } = req.body;

    if (title !== undefined && title.trim().length === 0) {
      return res.status(400).json({ error: 'Task list title cannot be empty' });
    }
    if (title && title.length > 100) {
      return res.status(400).json({ error: 'Task list title too long (max 100 characters)' });
    }

    const taskList = await TaskListService.updateTaskList(req.user!.id, taskListId, { title });

    return res.json({
      success: true,
      taskList: {
        ...taskList,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Task list not found in database') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'User not authorized to access this task list') {
        return res.status(403).json({ error: error.message });
      }
    }
    console.error('Error updating task list:', error);
    return res.status(500).json({ error: 'Failed to update task list' });
  }
});

router.delete('/:taskListId', async (req, res) => {
  try {
    const { taskListId } = req.params;
    const result = await TaskListService.deleteTaskList(req.user!.id, taskListId);

    return res.json({
      success: true,
      message: 'Task list deleted successfully',
      taskListId: result.id,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Task list not found in database') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'User not authorized to access this task list') {
        return res.status(403).json({ error: error.message });
      }
    }
    console.error('Error deleting task list:', error);
    return res.status(500).json({ error: 'Failed to delete task list' });
  }
});

router.get('/:taskListId/item', async (req, res) => {
  try {
    const { taskListId } = req.params;
    const tasks = await TaskListService.listTasks(req.user!.id, taskListId);

    return res.json({
      success: true,
      count: tasks.length,
      tasks,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Task list not found in database') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'User not authorized to access this task list') {
        return res.status(403).json({ error: error.message });
      }
    }
    console.error('Error fetching tasks:', error);
    return res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

router.post('/:taskListId/item', async (req, res) => {
  try {
    const { taskListId } = req.params;
    const { title, notes, due_date, task_hash } = req.body;
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const task = await TaskListService.createTask(req.user!.id, taskListId, {
      title,
      notes,
      due_date,
      task_hash,
    });

    return res.status(201).json({
      success: true,
      task: {
        ...task,
        created_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Task list not found in database') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'User not authorized to access this task list') {
        return res.status(403).json({ error: error.message });
      }
    }
    console.error('Error creating task:', error);
    return res.status(500).json({ error: 'Failed to create task' });
  }
});

router.patch('/:taskListId/item/:id', async (req, res) => {
  try {
    const { taskListId, id } = req.params;
    const { title, notes, due_date, status, task_hash } = req.body;

    const task = await TaskListService.updateTask(req.user!.id, taskListId, id, {
      title,
      notes,
      due_date,
      status,
      task_hash,
    });

    return res.json({
      success: true,
      task: {
        ...task,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Task list not found in database') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'Task not found in database') {
        return res.status(404).json({ error: error.message });
      }
      if (
        error.message === 'User not authorized to access this task list' ||
        error.message === 'Task does not belong to this task list'
      ) {
        return res.status(403).json({ error: error.message });
      }
    }
    console.error('Error updating task:', error);
    return res.status(500).json({ error: 'Failed to update task' });
  }
});

router.delete('/:taskListId/item/:id', async (req, res) => {
  try {
    const { taskListId, id } = req.params;

    const result = await TaskListService.deleteTask(req.user!.id, taskListId, id);

    return res.json({
      success: true,
      message: 'Task deleted successfully',
      taskId: result.id,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Task list not found in database') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'Task not found in database') {
        return res.status(404).json({ error: error.message });
      }
      if (
        error.message === 'User not authorized to access this task list' ||
        error.message === 'Task does not belong to this task list'
      ) {
        return res.status(403).json({ error: error.message });
      }
    }
    console.error('Error deleting task:', error);
    return res.status(500).json({ error: 'Failed to delete task' });
  }
});

export default router;
