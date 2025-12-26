/**
 * Supabase Client
 * Initializes and exports the Supabase client for use throughout the extension
 */

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// These are injected at build time by Vite
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_PUBLIC_KEY || '';

let supabaseClient: SupabaseClient | null = null;

/**
 * Get the Supabase client instance (singleton)
 * Lazily initializes the client on first use
 */
export const getSupabaseClient = (): SupabaseClient => {
  if (!supabaseClient) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Supabase URL and Anon Key must be configured in environment variables');
    }

    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false, // Chrome extension doesn't use URLs for auth
        storage: {
          // Use chrome.storage.local for session persistence
          getItem: async (key: string): Promise<string | null> =>
            new Promise(resolve => {
              chrome.storage.local.get([key], result => {
                resolve(result[key] || null);
              });
            }),
          setItem: async (key: string, value: string): Promise<void> =>
            new Promise(resolve => {
              chrome.storage.local.set({ [key]: value }, resolve);
            }),
          removeItem: async (key: string): Promise<void> =>
            new Promise(resolve => {
              chrome.storage.local.remove([key], resolve);
            }),
        },
      },
    });
  }

  return supabaseClient;
};

/**
 * Check if Supabase is configured
 */
export const isSupabaseConfigured = (): boolean => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Reset the Supabase client (for testing or re-initialization)
 */
export const resetSupabaseClient = (): void => {
  supabaseClient = null;
};
