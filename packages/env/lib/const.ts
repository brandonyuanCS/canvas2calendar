import { baseEnv } from './config.js';

export const IS_DEV = process.env['CLI_CEB_DEV'] === 'true';
export const IS_PROD = !IS_DEV;
export const IS_FIREFOX = process.env['CLI_CEB_FIREFOX'] === 'true';
export const IS_CI = process.env['CEB_CI'] === 'true';

// Supabase
export const SUPABASE_URL = baseEnv.SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = baseEnv.SUPABASE_PUBLIC_KEY || '';

// Stripe (for Phase 4)
export const STRIPE_PUBLISHABLE_KEY = baseEnv.STRIPE_PUBLISHABLE_KEY || '';
