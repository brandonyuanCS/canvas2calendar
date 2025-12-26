/**
 * Supabase Users Module
 * CRUD operations for the users table
 */

import { getSupabaseClient } from './client.js';
import type { DbUser, DbUserInsert, DbUserUpdate, SubscriptionTier } from './types.js';

/**
 * Upsert a user record (create or update)
 * Called after Google OAuth to ensure user exists in database
 */
export const upsertUser = async (userData: DbUserInsert): Promise<DbUser> => {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        ...userData,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'google_user_id',
        ignoreDuplicates: false,
      },
    )
    .select()
    .single();

  if (error) {
    console.error('[Supabase] Upsert user error:', error.message);
    throw new Error(`Failed to upsert user: ${error.message}`);
  }

  return data as DbUser;
};

/**
 * Get user by Google user ID
 */
export const getUserByGoogleId = async (googleUserId: string): Promise<DbUser | null> => {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.from('users').select('*').eq('google_user_id', googleUserId).single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned - user doesn't exist
      return null;
    }
    console.error('[Supabase] Get user error:', error.message);
    throw new Error(`Failed to get user: ${error.message}`);
  }

  return data as DbUser;
};

/**
 * Update user record
 */
export const updateUser = async (googleUserId: string, updates: DbUserUpdate): Promise<DbUser> => {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('users')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('google_user_id', googleUserId)
    .select()
    .single();

  if (error) {
    console.error('[Supabase] Update user error:', error.message);
    throw new Error(`Failed to update user: ${error.message}`);
  }

  return data as DbUser;
};

/**
 * Get user's subscription tier
 */
export const getSubscriptionTier = async (googleUserId: string): Promise<SubscriptionTier> => {
  const user = await getUserByGoogleId(googleUserId);
  return user?.subscription_tier || 'free';
};

/**
 * Check if user has premium (Pro or Max) subscription
 */
export const isPremiumUser = async (googleUserId: string): Promise<boolean> => {
  const tier = await getSubscriptionTier(googleUserId);
  return tier === 'pro' || tier === 'max';
};

/**
 * Check if user has active subscription (not canceled or past_due)
 */
export const hasActiveSubscription = async (googleUserId: string): Promise<boolean> => {
  const user = await getUserByGoogleId(googleUserId);
  if (!user) return false;

  return user.subscription_status === 'active' || user.subscription_status === 'trialing';
};
