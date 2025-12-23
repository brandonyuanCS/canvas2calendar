import type { ApiSyncReport, SyncPreferences } from '../types/index.js';

type ResetReport = {
  calendars: { deleted: number; errors: Array<{ calendarId: string; error: string }> };
  events: { deleted: number; errors: Array<{ eventId: string; error: string }> };
  taskLists: { deleted: number; errors: Array<{ taskListId: string; error: string }> };
  tasks: { deleted: number; errors: Array<{ taskId: string; error: string }> };
};

// Helper for message passing
const sendMessage = async <T>(message: unknown): Promise<T> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error('No response from background script'));
        return;
      }
      if (!response.success) {
        reject(new Error(response.error || 'Unknown error'));
        return;
      }
      resolve(response.data);
    });
  });

/**
 * Typed API endpoint methods
 */

// Auth endpoints
const auth = {
  /**
   * New Sign In method using chrome.identity
   */
  async signIn(): Promise<{ email: string; name: string }> {
    return sendMessage({ type: 'SIGN_IN' });
  },

  /**
   * Sign Out
   */
  async signOut(): Promise<void> {
    return sendMessage({ type: 'SIGN_OUT' });
  },

  /**
   * @deprecated Used for old server-side OAuth
   */
  async getGoogleAuthUrl(): Promise<{ authUrl: string }> {
    throw new Error('Deprecated: Use signIn() instead');
  },
};

// Calendar endpoints
const calendar = {
  /**
   * Check if user has a calendar configured
   */
  async checkExists(): Promise<boolean> {
    try {
      const status = await sendMessage<{ hasCalendar: boolean }>({ type: 'GET_STATUS' });
      return status.hasCalendar;
    } catch {
      return false;
    }
  },

  /**
   * Create a new calendar
   */
  async create(name: string, description: string): Promise<void> {
    await sendMessage({ type: 'CREATE_CALENDAR', name, description });
  },
};

// User endpoints
const user = {
  /**
   * Get user's ICS URL
   */
  async getIcsUrl(): Promise<{ ics_url: string } | null> {
    try {
      const userData = await sendMessage<{ canvas_ics_feed_url?: string }>({ type: 'GET_USER' });
      if (userData?.canvas_ics_feed_url) {
        return { ics_url: userData.canvas_ics_feed_url };
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Update user's ICS URL
   */
  async updateIcsUrl(icsUrl: string): Promise<{ ics_url: string }> {
    await sendMessage({ type: 'SET_ICS_URL', url: icsUrl });
    return { ics_url: icsUrl };
  },

  /**
   * Delete user's ICS URL (Not explicitly supported in background yet, setting to empty)
   */
  async deleteIcsUrl(): Promise<void> {
    await sendMessage({ type: 'SET_ICS_URL', url: '' });
  },

  /**
   * Get user's sync preferences
   */
  async getPreferences(): Promise<{ success: boolean; preferences: SyncPreferences }> {
    const { DEFAULT_PREFERENCES } = await import('../types/preferences.js');
    const userData = await sendMessage<{ preferences?: SyncPreferences } | null>({ type: 'GET_USER' });
    return {
      success: true,
      preferences: userData?.preferences || DEFAULT_PREFERENCES,
    };
  },

  /**
   * Update user's sync preferences
   */
  async updatePreferences(
    preferences: SyncPreferences,
  ): Promise<{ success: boolean; message: string; preferences: SyncPreferences }> {
    const updated = await sendMessage<SyncPreferences>({
      type: 'UPDATE_PREFERENCES',
      preferences,
    });
    return { success: true, message: 'Preferences updated', preferences: updated };
  },

  /**
   * Get Canvas metadata (courses, event types, etc.)
   */
  async getCanvasMetadata(): Promise<{
    courses: Array<{ code: string; eventCount: number; eventTypes: string[] }>;
    eventTypes: Record<string, number>;
    dateRange: { earliest: string; latest: string };
    totalEvents: number;
    calendarName?: string;
    lastFetched: string;
  }> {
    return sendMessage({ type: 'GET_CANVAS_METADATA' });
  },
};

// Sync endpoints
const sync = {
  /**
   * Perform a sync operation
   */
  async performSync(): Promise<{ success: boolean; report?: ApiSyncReport; error?: string }> {
    try {
      const report = await sendMessage<ApiSyncReport>({ type: 'SYNC_NOW' });
      return { success: true, report };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Sync failed' };
    }
  },

  /**
   * Reset all calendar data (calendars, task lists, events, and tasks)
   */
  async reset(): Promise<{ success: boolean; report: ResetReport }> {
    await sendMessage({ type: 'RESET_ALL' });
    // Return dummy report since RESET_ALL doesn't return detailed stats yet
    return {
      success: true,
      report: {
        calendars: { deleted: 0, errors: [] },
        events: { deleted: 0, errors: [] },
        taskLists: { deleted: 0, errors: [] },
        tasks: { deleted: 0, errors: [] },
      },
    };
  },
};

export type { ResetReport };
export { auth, calendar, user, sync };
