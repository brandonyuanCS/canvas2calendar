/**
 * Supabase Preferences Module
 * Cloud sync for user preferences (Pro users only)
 */

import { getSupabaseClient } from './client.js';
import { isPremiumUser } from './users.js';
import type { DbPreferences } from './types.js';

/**
 * Save preferences to cloud (Pro users only)
 * Local preferences take precedence - this is called when user saves locally
 *
 * @param googleUserId - The user's Google ID
 * @param preferences - The preferences object to save
 * @returns The saved preferences record, or null if user is not premium
 */
export const savePreferencesToCloud = async (
  googleUserId: string,
  preferences: Record<string, unknown>,
): Promise<DbPreferences | null> => {
  // Only premium users can sync to cloud
  const isPremium = await isPremiumUser(googleUserId);
  if (!isPremium) {
    console.log('[Supabase] User is not premium, skipping cloud sync');
    return null;
  }

  const supabase = getSupabaseClient();

  // First, get the user's database ID
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('google_user_id', googleUserId)
    .single();

  if (userError || !user) {
    console.error('[Supabase] Failed to get user for preferences sync:', userError?.message);
    return null;
  }

  // Upsert preferences
  const { data, error } = await supabase
    .from('preferences')
    .upsert(
      {
        user_id: user.id,
        preferences_data: preferences,
        version: 1, // TODO: Implement version incrementing for conflict detection
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id',
      },
    )
    .select()
    .single();

  if (error) {
    console.error('[Supabase] Failed to save preferences:', error.message);
    return null;
  }

  console.log('[Supabase] Preferences saved to cloud');
  return data as DbPreferences;
};

/**
 * Load preferences from cloud (Pro users only)
 * Called on initial load to check if cloud has preferences
 *
 * @param googleUserId - The user's Google ID
 * @returns The preferences data, or null if not found or user is not premium
 */
export const loadPreferencesFromCloud = async (googleUserId: string): Promise<Record<string, unknown> | null> => {
  // Only premium users can load from cloud
  const isPremium = await isPremiumUser(googleUserId);
  if (!isPremium) {
    return null;
  }

  const supabase = getSupabaseClient();

  // Get user ID first
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('google_user_id', googleUserId)
    .single();

  if (userError || !user) {
    return null;
  }

  // Get preferences
  const { data, error } = await supabase.from('preferences').select('preferences_data').eq('user_id', user.id).single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No preferences found - that's fine
      return null;
    }
    console.error('[Supabase] Failed to load preferences:', error.message);
    return null;
  }

  return (data?.preferences_data as Record<string, unknown>) || null;
};

/**
 * Delete cloud preferences
 * Called when user resets their data
 */
export const deleteCloudPreferences = async (googleUserId: string): Promise<void> => {
  const supabase = getSupabaseClient();

  // Get user ID first
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('google_user_id', googleUserId)
    .single();

  if (userError || !user) {
    return;
  }

  await supabase.from('preferences').delete().eq('user_id', user.id);
};
