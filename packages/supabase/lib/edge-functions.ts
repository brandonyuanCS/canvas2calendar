/**
 * Supabase Edge Function Client
 * Secure API calls to Edge Functions instead of direct database access
 */

// Supabase URL is injected at build time
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_PUBLIC_KEY || '';

interface GetOrCreateUserParams {
  google_user_id: string;
  email: string;
  name?: string;
  picture?: string;
}

interface UserResponse {
  id: string;
  google_user_id: string;
  email: string;
  trial_started_at: string;
  payment_status: 'unpaid' | 'paid' | 'refunded';
  subscription_tier: 'free' | 'pro' | 'max';
  deleted_at?: string | null;
}

interface SubscriptionResponse {
  has_access: boolean;
  tier: 'free' | 'pro' | 'max';
  is_trial: boolean;
  is_paid: boolean;
  trial_expires_at?: string;
  trial_days_remaining?: number;
  reason?: string;
}

interface CheckoutParams {
  google_user_id: string;
  email: string;
  success_url?: string;
  cancel_url?: string;
}

interface CheckoutResponse {
  checkout_url: string;
}

/**
 * Get or create a user via Edge Function
 * This is the secure way to ensure users exist in the database
 */
export const getOrCreateUser = async (params: GetOrCreateUserParams): Promise<UserResponse> => {
  if (!SUPABASE_URL) {
    throw new Error('Supabase URL not configured');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/get-or-create-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get/create user: ${response.status}`);
  }

  return response.json();
};

/**
 * Check subscription tier via Edge Function
 * This is the secure way to check subscription status
 */
export const checkSubscription = async (googleUserId: string): Promise<SubscriptionResponse> => {
  if (!SUPABASE_URL) {
    // Return active trial if Supabase not configured (dev mode)
    return {
      has_access: true,
      tier: 'free',
      is_trial: true,
      is_paid: false,
      trial_days_remaining: 14,
    };
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/check-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ google_user_id: googleUserId }),
    });

    if (!response.ok) {
      console.warn('[Supabase] Subscription check failed, defaulting to trial active');
      return { has_access: true, tier: 'free', is_trial: true, is_paid: false };
    }

    return response.json();
  } catch (error) {
    console.warn('[Supabase] Subscription check error, defaulting to trial active:', error);
    return { has_access: true, tier: 'free', is_trial: true, is_paid: false };
  }
};

/**
 * Create a Stripe Checkout session via Edge Function
 * Returns a checkout URL to redirect the user to
 */
export const createCheckoutSession = async (params: CheckoutParams): Promise<CheckoutResponse> => {
  if (!SUPABASE_URL) {
    throw new Error('Supabase URL not configured');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/stripe-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to create checkout session: ${response.status}`);
  }

  return response.json();
};

/**
 * Check if Supabase Edge Functions are available
 */
export const isEdgeFunctionsConfigured = (): boolean => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export type { GetOrCreateUserParams, UserResponse, SubscriptionResponse, CheckoutParams, CheckoutResponse };
