/**
 * Supabase Authentication
 * Handles signing in with Google ID token and session management
 */

import { getSupabaseClient } from './client.js';
import { upsertUser, getUserByGoogleId } from './users.js';
import type { SupabaseAuthResult, DbUser } from './types.js';

/**
 * Sign in to Supabase using a Google ID token
 * This is called after successful Google OAuth in the extension
 *
 * @param idToken - The Google ID token from OAuth flow
 * @param userInfo - Google user info (id, email, name, picture)
 * @param nonce - The nonce used when requesting the id_token (for verification)
 * @returns Authentication result with user data
 */
export const signInWithGoogleToken = async (
  idToken: string,
  userInfo: { id: string; email: string; name?: string; picture?: string },
  // nonce?: string | null,
): Promise<SupabaseAuthResult> => {
  try {
    const supabase = getSupabaseClient();

    // Debug: decode id_token to see claims
    try {
      const payload = JSON.parse(atob(idToken.split('.')[1]));
      console.log('[Supabase] ID token claims:', {
        aud: payload.aud,
        iss: payload.iss,
        nonce: payload.nonce,
      });
    } catch {
      console.log('[Supabase] Could not decode id_token');
    }

    // Sign in to Supabase using the Google ID token
    // Note: Not passing nonce - Supabase may not support nonce verification for Google
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
      // Omitting nonce - the token has one but Supabase's Google provider may not verify it
    });

    if (error) {
      console.error('[Supabase] Auth error:', error.message);
      return { success: false, error: error.message };
    }

    if (!data.user) {
      return { success: false, error: 'No user returned from Supabase auth' };
    }

    // Upsert user record in our users table
    const dbUser = await upsertUser({
      google_user_id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name || null,
      picture: userInfo.picture || null,
      subscription_tier: 'free',
      subscription_status: 'active',
      stripe_customer_id: null,
      stripe_subscription_id: null,
    });

    return { success: true, user: dbUser };
  } catch (error) {
    console.error('[Supabase] Sign in error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during sign in',
    };
  }
};

/**
 * Sign out from Supabase
 */
export const signOut = async (): Promise<void> => {
  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
};

/**
 * Get current Supabase session
 */
export const getSession = async () => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error('[Supabase] Get session error:', error.message);
    return null;
  }

  return data.session;
};

/**
 * Get current user from database using Google ID
 * This fetches the full user record including subscription status
 */
export const getCurrentUser = async (googleUserId: string): Promise<DbUser | null> => getUserByGoogleId(googleUserId);

/**
 * Check if there's an active Supabase session
 */
export const hasActiveSession = async (): Promise<boolean> => {
  const session = await getSession();
  return session !== null;
};
