// Supabase Edge Function: Check Subscription
// Checks if user has active trial or paid access

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Trial duration in days
const TRIAL_DAYS = 14;

interface RequestBody {
  google_user_id: string;
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

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body: RequestBody = await req.json();
    const { google_user_id } = body;

    // Validate required fields
    if (!google_user_id) {
      return new Response(JSON.stringify({ error: 'Missing required field: google_user_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch user data
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('trial_started_at, payment_status, subscription_tier, deleted_at')
      .eq('google_user_id', google_user_id)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching user:', fetchError);
      return new Response(JSON.stringify({ error: 'Failed to query user' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // User not found or soft-deleted
    if (!user || user.deleted_at) {
      const response: SubscriptionResponse = {
        has_access: false,
        tier: 'free',
        is_trial: false,
        is_paid: false,
        reason: 'user_not_found',
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user has paid (priority check)
    if (user.payment_status === 'paid') {
      const response: SubscriptionResponse = {
        has_access: true,
        tier: user.subscription_tier as 'free' | 'pro' | 'max',
        is_trial: false,
        is_paid: true,
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate trial expiration
    const trialStarted = new Date(user.trial_started_at);
    const trialExpires = new Date(trialStarted.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date();

    const trialActive = now < trialExpires;
    const msRemaining = trialExpires.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

    const response: SubscriptionResponse = {
      has_access: trialActive,
      tier: user.subscription_tier as 'free' | 'pro' | 'max',
      is_trial: true,
      is_paid: false,
      trial_expires_at: trialExpires.toISOString(),
      trial_days_remaining: Math.max(0, daysRemaining),
      reason: trialActive ? undefined : 'trial_expired',
    };

    console.log(
      `Subscription check for ${google_user_id}: ${trialActive ? 'active trial' : 'trial expired'} (${daysRemaining} days remaining)`,
    );

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
