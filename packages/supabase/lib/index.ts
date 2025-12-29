/**
 * Supabase Package - Public API
 */

// Client
export { getSupabaseClient, isSupabaseConfigured, resetSupabaseClient } from './client.js';

// Edge Functions (Secure API calls)
export {
  getOrCreateUser,
  checkSubscription,
  createCheckoutSession,
  isEdgeFunctionsConfigured,
} from './edge-functions.js';
export type {
  GetOrCreateUserParams,
  UserResponse,
  SubscriptionResponse,
  CheckoutParams,
  CheckoutResponse,
} from './edge-functions.js';

// Auth (deprecated - kept for compatibility)
export { signInWithGoogleToken, signOut, getSession, getCurrentUser, hasActiveSession } from './auth.js';

// Users (deprecated - use Edge Functions instead)
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
