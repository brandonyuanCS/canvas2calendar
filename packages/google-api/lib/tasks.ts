/**
 * Google Tasks API Client
 * Lightweight fetch-based wrapper for Tasks v1 API
 */

import { googleFetch } from './auth.js';
import type { GoogleTask, GoogleTaskList, GoogleTaskListResponse, GoogleTaskResponse } from './types.js';

const TASKS_BASE_URL = 'https://www.googleapis.com/tasks/v1';

/**
 * Google Tasks API methods
 */
export const TasksAPI = {
  // ============= Task List Operations =============

  /**
   * List all task lists
   */
  async listTaskLists(maxResults = 100): Promise<GoogleTaskListResponse> {
    return googleFetch<GoogleTaskListResponse>(`${TASKS_BASE_URL}/users/@me/lists?maxResults=${maxResults}`);
  },

  /**
   * Get a task list by ID
   */
  async getTaskList(taskListId: string): Promise<GoogleTaskList> {
    return googleFetch<GoogleTaskList>(`${TASKS_BASE_URL}/users/@me/lists/${encodeURIComponent(taskListId)}`);
  },

  /**
   * Create a task list
   */
  async createTaskList(taskList: GoogleTaskList): Promise<GoogleTaskList> {
    return googleFetch<GoogleTaskList>(`${TASKS_BASE_URL}/users/@me/lists`, {
      method: 'POST',
      body: JSON.stringify(taskList),
    });
  },

  /**
   * Update a task list
   */
  async updateTaskList(taskListId: string, taskList: Partial<GoogleTaskList>): Promise<GoogleTaskList> {
    return googleFetch<GoogleTaskList>(`${TASKS_BASE_URL}/users/@me/lists/${encodeURIComponent(taskListId)}`, {
      method: 'PATCH',
      body: JSON.stringify(taskList),
    });
  },

  /**
   * Delete a task list
   */
  async deleteTaskList(taskListId: string): Promise<void> {
    await googleFetch<void>(`${TASKS_BASE_URL}/users/@me/lists/${encodeURIComponent(taskListId)}`, {
      method: 'DELETE',
    });
  },

  // ============= Task Operations =============

  /**
   * List tasks in a task list
   */
  async listTasks(
    taskListId: string,
    options?: {
      maxResults?: number;
      showCompleted?: boolean;
      showHidden?: boolean;
      pageToken?: string;
    },
  ): Promise<GoogleTaskResponse> {
    const params = new URLSearchParams();
    if (options?.maxResults) params.set('maxResults', options.maxResults.toString());
    if (options?.showCompleted !== undefined) params.set('showCompleted', options.showCompleted.toString());
    if (options?.showHidden !== undefined) params.set('showHidden', options.showHidden.toString());
    if (options?.pageToken) params.set('pageToken', options.pageToken);

    return googleFetch<GoogleTaskResponse>(`${TASKS_BASE_URL}/lists/${encodeURIComponent(taskListId)}/tasks?${params}`);
  },

  /**
   * Get a task by ID
   */
  async getTask(taskListId: string, taskId: string): Promise<GoogleTask> {
    return googleFetch<GoogleTask>(
      `${TASKS_BASE_URL}/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
    );
  },

  /**
   * Create a task
   */
  async createTask(taskListId: string, task: GoogleTask): Promise<GoogleTask> {
    return googleFetch<GoogleTask>(`${TASKS_BASE_URL}/lists/${encodeURIComponent(taskListId)}/tasks`, {
      method: 'POST',
      body: JSON.stringify(task),
    });
  },

  /**
   * Update a task
   */
  async updateTask(taskListId: string, taskId: string, task: Partial<GoogleTask>): Promise<GoogleTask> {
    return googleFetch<GoogleTask>(
      `${TASKS_BASE_URL}/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(task),
      },
    );
  },

  /**
   * Delete a task
   */
  async deleteTask(taskListId: string, taskId: string): Promise<void> {
    await googleFetch<void>(
      `${TASKS_BASE_URL}/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
      { method: 'DELETE' },
    );
  },
};
