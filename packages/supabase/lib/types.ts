/**
 * Supabase Database Types (Domain-Specific)
 * TypeScript types for database tables and operations
 *
 * Ownership: @extension/supabase package
 * These types are specific to Supabase database schema and should not be moved to shared
 */

// ============= Subscription Types =============

export type SubscriptionTier = 'free' | 'pro' | 'max';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing';

// ============= Database Row Types =============

/**
 * User row in the `users` table
 */
export interface DbUser {
  id: string;
  google_user_id: string;
  email: string;
  name: string | null;
  picture: string | null;
  subscription_tier: SubscriptionTier;
  subscription_status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Preferences row in the `preferences` table
 */
export interface DbPreferences {
  id: string;
  user_id: string;
  preferences_data: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
}

// ============= Insert/Update Types =============

export type DbUserInsert = Omit<DbUser, 'id' | 'created_at' | 'updated_at'>;
export type DbUserUpdate = Partial<Omit<DbUser, 'id' | 'google_user_id' | 'created_at'>>;

export type DbPreferencesInsert = Omit<DbPreferences, 'id' | 'created_at' | 'updated_at'>;
export type DbPreferencesUpdate = Partial<Omit<DbPreferences, 'id' | 'user_id' | 'created_at'>>;

// ============= Supabase Auth Types =============

export interface SupabaseAuthResult {
  success: boolean;
  user?: DbUser;
  error?: string;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user_id: string;
}
