import * as GoogleService from './google.service.js';
import { prisma } from '../lib/prisma.js';
import { generateEventHash } from '../utils/hash.util.js';
import type { CanvasEvent, TaskSyncReport } from '@extension/shared';
import type { tasks_v1 } from 'googleapis';

// helper functions
const getUser = async (userId: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { task_lists: true },
  });
  if (!user) {
    throw new Error('User not found');
  }
  if (!user.google_access_token) {
    throw new Error('User not authenticated with Google');
  }
  return user;
};

const getUserAndTaskList = async (userId: number, googleTaskListId: string) => {
  const user = await getUser(userId);
  const taskListRecord = await prisma.task_list.findUnique({
    where: { google_task_list_id: googleTaskListId },
  });
  if (!taskListRecord) {
    throw new Error('Task list not found in database');
  }
  if (taskListRecord.user_id !== user.id) {
    throw new Error('User not authorized to access this task list');
  }

  return { user, taskListRecord };
};

// exported functions
export const createTaskList = async (userId: number, taskListData: { title: string }) => {
  const user = await getUser(userId);
  const tasksClient = GoogleService.getGoogleTasksClient({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
    expiry_date: user.google_token_expires_at?.getTime(),
  });

  const response = await tasksClient.tasklists.insert({
    requestBody: {
      title: taskListData.title.trim(),
    },
  });

  const createdTaskList = response.data;
  if (!createdTaskList.id) {
    throw new Error('Google did not return task list ID');
  }

  await prisma.task_list.create({
    data: {
      user_id: user.id,
      google_task_list_id: createdTaskList.id,
      title: createdTaskList.title || 'Untitled Task List',
    },
  });

  return {
    id: createdTaskList.id,
    title: createdTaskList.title,
  };
};

export const listTaskLists = async (userId: number) => {
  const user = await getUser(userId);
  const tasksClient = GoogleService.getGoogleTasksClient({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
    expiry_date: user.google_token_expires_at?.getTime(),
  });

  const response = await tasksClient.tasklists.list({
    maxResults: 100,
  });

  return (response.data.items || []).map(taskList => ({
    id: taskList.id,
    title: taskList.title,
    updated: taskList.updated,
  }));
};

export const updateTaskList = async (userId: number, googleTaskListId: string, updates: { title?: string }) => {
  const { user } = await getUserAndTaskList(userId, googleTaskListId);

  const tasksClient = GoogleService.getGoogleTasksClient({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
    expiry_date: user.google_token_expires_at?.getTime(),
  });

  const requestBody: Partial<tasks_v1.Schema$TaskList> = {};
  if (updates.title !== undefined) {
    requestBody.title = updates.title.trim();
  }

  const response = await tasksClient.tasklists.patch({
    tasklist: googleTaskListId,
    requestBody,
  });

  const updatedTaskList = response.data;
  if (!updatedTaskList) {
    throw new Error('Failed to update task list in Google Tasks');
  }

  // Update DB
  await prisma.task_list.update({
    where: { google_task_list_id: googleTaskListId },
    data: {
      ...(updates.title && { title: updates.title.trim() }),
    },
  });

  return {
    id: updatedTaskList.id,
    title: updatedTaskList.title,
  };
};

export const deleteTaskList = async (userId: number, googleTaskListId: string) => {
  const { user, taskListRecord } = await getUserAndTaskList(userId, googleTaskListId);

  const tasksClient = GoogleService.getGoogleTasksClient({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
    expiry_date: user.google_token_expires_at?.getTime(),
  });

  await tasksClient.tasklists.delete({
    tasklist: googleTaskListId,
  });

  await prisma.task.deleteMany({
    where: { task_list_id: taskListRecord.id },
  });

  await prisma.task_list.delete({
    where: { google_task_list_id: googleTaskListId },
  });

  return { id: googleTaskListId };
};

export const listTasks = async (userId: number, googleTaskListId: string) => {
  const { user } = await getUserAndTaskList(userId, googleTaskListId);

  const tasksClient = GoogleService.getGoogleTasksClient({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
    expiry_date: user.google_token_expires_at?.getTime(),
  });

  const response = await tasksClient.tasks.list({
    tasklist: googleTaskListId,
    maxResults: 100,
    showCompleted: true,
  });

  return (response.data.items || []).map(task => ({
    id: task.id,
    title: task.title,
    notes: task.notes,
    due: task.due,
    status: task.status,
    completed: task.completed,
  }));
};

export const createTask = async (
  userId: number,
  googleTaskListId: string,
  taskData: {
    title: string;
    notes?: string;
    due_date?: string;
    task_hash?: string;
    ics_uid?: string;
  },
) => {
  const { user, taskListRecord } = await getUserAndTaskList(userId, googleTaskListId);

  const tasksClient = GoogleService.getGoogleTasksClient({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
    expiry_date: user.google_token_expires_at?.getTime(),
  });

  const googleTaskData: tasks_v1.Schema$Task = {
    title: taskData.title.trim(),
    ...(taskData.notes && { notes: taskData.notes.trim() }),
    ...(taskData.due_date && { due: new Date(taskData.due_date).toISOString() }),
  };

  const response = await tasksClient.tasks.insert({
    tasklist: googleTaskListId,
    requestBody: googleTaskData,
  });

  const createdTask = response.data;
  if (!createdTask || !createdTask.id) {
    throw new Error('Google did not return a task ID');
  }

  await prisma.task.create({
    data: {
      task_list_id: taskListRecord.id,
      google_task_id: createdTask.id,
      ics_uid: taskData.ics_uid || 'unknown',
      title: taskData.title.trim(),
      notes: taskData.notes?.trim(),
      due_date: taskData.due_date ? new Date(taskData.due_date) : null,
      task_hash: taskData.task_hash,
    },
  });

  return {
    id: createdTask.id,
    title: createdTask.title,
    notes: createdTask.notes,
    due: createdTask.due,
    status: createdTask.status,
  };
};

export const updateTask = async (
  userId: number,
  googleTaskListId: string,
  googleTaskId: string,
  updates: {
    title?: string;
    notes?: string;
    due_date?: string;
    status?: string;
    task_hash?: string;
  },
) => {
  const { user, taskListRecord } = await getUserAndTaskList(userId, googleTaskListId);

  const existingTask = await prisma.task.findUnique({
    where: { google_task_id: googleTaskId },
  });
  if (!existingTask) {
    throw new Error('Task not found in database');
  }
  if (existingTask.task_list_id !== taskListRecord.id) {
    throw new Error('Task does not belong to this task list');
  }

  const tasksClient = GoogleService.getGoogleTasksClient({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
    expiry_date: user.google_token_expires_at?.getTime(),
  });

  const taskData: Partial<tasks_v1.Schema$Task> = {};
  if (updates.title !== undefined) {
    taskData.title = updates.title.trim();
  }
  if (updates.notes !== undefined) {
    taskData.notes = updates.notes?.trim();
  }
  if (updates.due_date !== undefined) {
    taskData.due = updates.due_date ? new Date(updates.due_date).toISOString() : null;
  }
  if (updates.status !== undefined) {
    taskData.status = updates.status;
  }

  const response = await tasksClient.tasks.patch({
    tasklist: googleTaskListId,
    task: googleTaskId,
    requestBody: taskData,
  });

  const updatedTask = response.data;
  if (!updatedTask) {
    throw new Error('Failed to update task in Google Tasks');
  }

  // Update DB
  await prisma.task.update({
    where: { google_task_id: googleTaskId },
    data: {
      ...(updates.title && { title: updates.title.trim() }),
      ...(updates.notes !== undefined && { notes: updates.notes?.trim() }),
      ...(updates.due_date !== undefined && {
        due_date: updates.due_date ? new Date(updates.due_date) : null,
      }),
      ...(updates.task_hash && { task_hash: updates.task_hash }),
    },
  });

  return {
    id: updatedTask.id,
    title: updatedTask.title,
    notes: updatedTask.notes,
    due: updatedTask.due,
    status: updatedTask.status,
  };
};

export const deleteTask = async (userId: number, googleTaskListId: string, googleTaskId: string) => {
  const { user, taskListRecord } = await getUserAndTaskList(userId, googleTaskListId);

  const existingTask = await prisma.task.findUnique({
    where: { google_task_id: googleTaskId },
  });
  if (!existingTask) {
    throw new Error('Task not found in database');
  }
  if (existingTask.task_list_id !== taskListRecord.id) {
    throw new Error('Task does not belong to this task list');
  }

  const tasksClient = GoogleService.getGoogleTasksClient({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
    expiry_date: user.google_token_expires_at?.getTime(),
  });

  await tasksClient.tasks.delete({
    tasklist: googleTaskListId,
    task: googleTaskId,
  });

  await prisma.task.delete({
    where: { google_task_id: googleTaskId },
  });

  return { id: googleTaskId };
};

// Sync tasks from parsed ICS data, grouped by course
export const syncTasks = async (userId: number, events: CanvasEvent[]): Promise<TaskSyncReport> => {
  const report: TaskSyncReport = {
    taskLists: {
      created: [],
      existing: [],
    },
    tasks: {
      created: [],
      updated: [],
      deleted: [],
      unchanged: [],
    },
    errors: [],
  };

  try {
    // 1. Get user
    const user = await getUser(userId);

    // 2. Group events by course code
    const eventsByCourse = new Map<string, CanvasEvent[]>();
    for (const event of events) {
      const courseCode = event.courseCode || 'Uncategorized';
      if (!eventsByCourse.has(courseCode)) {
        eventsByCourse.set(courseCode, []);
      }
      eventsByCourse.get(courseCode)!.push(event);
    }

    // 3. For each course, find or create task list
    const tasksClient = GoogleService.getGoogleTasksClient({
      access_token: user.google_access_token,
      refresh_token: user.google_refresh_token,
      expiry_date: user.google_token_expires_at?.getTime(),
    });

    for (const [courseCode, courseEvents] of eventsByCourse) {
      try {
        // Find existing task list for this course
        let taskListRecord = await prisma.task_list.findFirst({
          where: {
            user_id: user.id,
            title: courseCode,
          },
        });

        let googleTaskListId: string;

        if (!taskListRecord) {
          // Create new task list
          const response = await tasksClient.tasklists.insert({
            requestBody: {
              title: courseCode,
            },
          });

          const createdTaskList = response.data;
          if (!createdTaskList.id) {
            throw new Error(`Failed to create task list for ${courseCode}`);
          }

          googleTaskListId = createdTaskList.id;

          taskListRecord = await prisma.task_list.create({
            data: {
              user_id: user.id,
              google_task_list_id: googleTaskListId,
              title: courseCode,
            },
          });

          report.taskLists.created.push({
            title: courseCode,
            id: googleTaskListId,
          });
        } else {
          googleTaskListId = taskListRecord.google_task_list_id;
          report.taskLists.existing.push({
            title: courseCode,
            id: googleTaskListId,
          });
        }

        // 4. Load existing tasks for this task list
        const existingTasks = await prisma.task.findMany({
          where: { task_list_id: taskListRecord.id },
        });

        // 5. Build maps by ics_uid
        const existingTaskMap = new Map(existingTasks.map(t => [t.ics_uid, t]));
        const incomingTaskMap = new Map(courseEvents.map(e => [e.uid, { event: e, hash: generateEventHash(e) }]));

        // 6. Determine operations (create/update/delete)

        // Check for creates and updates
        for (const [icsUid, { event: incomingEvent, hash: incomingHash }] of incomingTaskMap) {
          try {
            const existingTask = existingTaskMap.get(icsUid);

            if (!existingTask) {
              // CREATE: Task doesn't exist in our DB
              const createdTask = await createTask(userId, googleTaskListId, {
                title: incomingEvent.summary,
                notes: incomingEvent.description,
                due_date: incomingEvent.dtstart.toISOString(),
                task_hash: incomingHash,
                ics_uid: icsUid,
              });

              report.tasks.created.push({
                ics_uid: icsUid,
                title: incomingEvent.summary,
                id: createdTask.id!,
                taskListTitle: courseCode,
              });
            } else if (existingTask.task_hash !== incomingHash) {
              // UPDATE: Task exists but hash changed
              const updatedTask = await updateTask(userId, googleTaskListId, existingTask.google_task_id, {
                title: incomingEvent.summary,
                notes: incomingEvent.description,
                due_date: incomingEvent.dtstart.toISOString(),
                task_hash: incomingHash,
              });

              report.tasks.updated.push({
                ics_uid: icsUid,
                title: incomingEvent.summary,
                id: updatedTask.id!,
                taskListTitle: courseCode,
              });
            } else {
              // UNCHANGED: Task exists and hash matches
              report.tasks.unchanged.push({
                ics_uid: icsUid,
                title: incomingEvent.summary,
                taskListTitle: courseCode,
              });
            }
          } catch (error) {
            report.errors.push({
              ics_uid: icsUid,
              courseCode,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        // Check for deletes (tasks in DB but not in ICS for this course)
        // Only delete Canvas-synced tasks (preserve manually created tasks)
        for (const [icsUid, existingTask] of existingTaskMap) {
          if (!incomingTaskMap.has(icsUid) && icsUid.startsWith('event-')) {
            try {
              await deleteTask(userId, googleTaskListId, existingTask.google_task_id);
              report.tasks.deleted.push({
                ics_uid: icsUid,
                title: existingTask.title,
                id: existingTask.google_task_id,
                taskListTitle: courseCode,
              });
            } catch (error) {
              report.errors.push({
                ics_uid: icsUid,
                courseCode,
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }
        }
      } catch (error) {
        report.errors.push({
          courseCode,
          error: error instanceof Error ? error.message : 'Unknown error processing course',
        });
      }
    }

    return report;
  } catch (error) {
    // Top-level error
    report.errors.push({
      error: error instanceof Error ? error.message : 'Unknown error during task sync',
    });
    return report;
  }
};
