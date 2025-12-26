/**
 * Supabase Package - Public API
 */

// Client
export { getSupabaseClient, isSupabaseConfigured, resetSupabaseClient } from './client.js';

// Auth
export { signInWithGoogleToken, signOut, getSession, getCurrentUser, hasActiveSession } from './auth.js';

// Users
export {
  upsertUser,
  getUserByGoogleId,
  updateUser,
  getSubscriptionTier,
  isPremiumUser,
  hasActiveSubscription,
} from './users.js';

// Preferences
export { savePreferencesToCloud, loadPreferencesFromCloud, deleteCloudPreferences } from './preferences.js';

// Types
export type {
  SubscriptionTier,
  SubscriptionStatus,
  DbUser,
  DbPreferences,
  DbUserInsert,
  DbUserUpdate,
  DbPreferencesInsert,
  DbPreferencesUpdate,
  SupabaseAuthResult,
  SupabaseSession,
} from './types.js';
