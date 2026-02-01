// Supabase Edge Function: get-or-create-user
// Securely creates or retrieves user data with server-authoritative trial start time

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface RequestBody {
  google_user_id: string;
  email: string;
  name?: string;
  picture?: string;
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
    const { google_user_id, email, name, picture } = body;

    // Validate required fields
    if (!google_user_id || !email) {
      return new Response(JSON.stringify({ error: 'Missing required fields: google_user_id, email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user exists (including soft-deleted users)
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('google_user_id', google_user_id)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching user:', fetchError);
      return new Response(JSON.stringify({ error: 'Failed to query user' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If user exists
    if (existingUser) {
      // ANTI-ABUSE: Block soft-deleted users from re-registering
      if (existingUser.deleted_at) {
        console.warn(`Soft-deleted user attempted to re-register: ${google_user_id}`);
        return new Response(
          JSON.stringify({
            error: 'This account was previously deleted. Please contact support to restore access.',
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Update profile information (name, email, picture may have changed)
      // IMPORTANT: Do NOT update trial_started_at - it's immutable
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          email,
          name: name || existingUser.name,
          picture: picture || existingUser.picture,
          updated_at: new Date().toISOString(),
        })
        .eq('google_user_id', google_user_id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating user:', updateError);
        return new Response(JSON.stringify({ error: 'Failed to update user' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`Returning existing user: ${google_user_id}`);
      return new Response(JSON.stringify(updatedUser), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create new user with trial
    const now = new Date().toISOString();
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        google_user_id,
        email,
        name,
        picture,
        trial_started_at: now, // SERVER sets this authoritatively
        payment_status: 'unpaid',
        subscription_tier: 'free',
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating user:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to create user' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Created new user with trial: ${google_user_id}`);
    return new Response(JSON.stringify(newUser), {
      status: 201,
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
