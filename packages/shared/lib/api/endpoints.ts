import { apiClient } from './client.js';
import type { ApiSyncReport, SyncPreferences } from '../types/index.js';

export type ResetReport = {
  calendars: { deleted: number; errors: Array<{ calendarId: string; error: string }> };
  events: { deleted: number; errors: Array<{ eventId: string; error: string }> };
  taskLists: { deleted: number; errors: Array<{ taskListId: string; error: string }> };
  tasks: { deleted: number; errors: Array<{ taskId: string; error: string }> };
};

/**
 * Typed API endpoint methods
 */

// Auth endpoints
export const auth = {
  /**
   * Get Google OAuth authorization URL
   */
  async getGoogleAuthUrl(): Promise<{ authUrl: string }> {
    return apiClient.requestPublic('/auth/google');
  },
};

// Calendar endpoints
export const calendar = {
  /**
   * Check if user has a calendar configured
   */
  async checkExists(): Promise<boolean> {
    try {
      await apiClient.request('/calendar');
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Create a new calendar
   */
  async create(name: string, description: string): Promise<void> {
    await apiClient.request('/calendar', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  },
};

// User endpoints
export const user = {
  /**
   * Get user's ICS URL
   */
  async getIcsUrl(): Promise<{ ics_url: string } | null> {
    try {
      return await apiClient.request<{ ics_url: string }>('/user/ics-url');
    } catch {
      return null;
    }
  },

  /**
   * Update user's ICS URL
   */
  async updateIcsUrl(icsUrl: string): Promise<{ ics_url: string }> {
    return apiClient.request('/user/ics-url', {
      method: 'PUT',
      body: JSON.stringify({ ics_url: icsUrl }),
    });
  },

  /**
   * Delete user's ICS URL
   */
  async deleteIcsUrl(): Promise<void> {
    await apiClient.request('/user/ics-url', {
      method: 'DELETE',
    });
  },

  /**
   * Get user's sync preferences
   */
  async getPreferences(): Promise<{ success: boolean; preferences: SyncPreferences }> {
    return apiClient.request('/user/preferences');
  },

  /**
   * Update user's sync preferences
   */
  async updatePreferences(
    preferences: SyncPreferences,
  ): Promise<{ success: boolean; message: string; preferences: SyncPreferences }> {
    return apiClient.request('/user/preferences', {
      method: 'PUT',
      body: JSON.stringify({ preferences }),
    });
  },

  /**
   * Get Canvas metadata (for preferences UI)
   */
  async getCanvasMetadata(): Promise<unknown> {
    return apiClient.request('/user/canvas-metadata');
  },
};

// Sync endpoints
export const sync = {
  /**
   * Perform a sync operation
   */
  async performSync(): Promise<{ success: boolean; report?: ApiSyncReport; error?: string }> {
    return apiClient.request('/sync', {
      method: 'POST',
    });
  },

  /**
   * Reset all calendar data (calendars, task lists, events, and tasks)
   */
  async reset(): Promise<{ success: boolean; report: ResetReport }> {
    return apiClient.request('/sync/reset', {
      method: 'POST',
    });
  },
};
