/**
 * Supabase Preferences Module
 * Cloud sync for user preferences via Edge Function
 */

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_PUBLIC_KEY || '';

/**
 * Save preferences to cloud via Edge Function
 *
 * @param googleUserId - The user's Google ID
 * @param preferences - The preferences object to save
 */
export const savePreferencesToCloud = async (
  googleUserId: string,
  preferences: Record<string, unknown>,
): Promise<void> => {
  if (!SUPABASE_URL) return;

  const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-preferences`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      google_user_id: googleUserId,
      preferences_data: preferences,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to save preferences: ${response.status}`);
  }

  console.log('[Supabase] Preferences saved to cloud');
};

/**
 * Load preferences from cloud via Edge Function
 *
 * @param googleUserId - The user's Google ID
 * @returns The preferences data, or null if not found
 */
export const loadPreferencesFromCloud = async (googleUserId: string): Promise<Record<string, unknown> | null> => {
  if (!SUPABASE_URL) return null;

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/manage-preferences?google_user_id=${encodeURIComponent(googleUserId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    },
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Failed to load preferences: ${response.status}`);
  }

  const data = await response.json();
  return (data.preferences_data as Record<string, unknown>) ?? null;
};

/**
 * Delete cloud preferences via Edge Function
 * Called when user resets their data
 */
export const deleteCloudPreferences = async (googleUserId: string): Promise<void> => {
  if (!SUPABASE_URL) return;

  // Saving an empty object effectively clears preferences
  // A dedicated DELETE endpoint can be added later if needed
  await savePreferencesToCloud(googleUserId, {});
};
