// Supabase Edge Function: manage-preferences
// Saves and loads user preferences using the service role key (bypasses RLS)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // GET: Load preferences
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const googleUserId = url.searchParams.get('google_user_id');

      if (!googleUserId) {
        return new Response(JSON.stringify({ error: 'Missing google_user_id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Look up the user's Supabase ID
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('google_user_id', googleUserId)
        .maybeSingle();

      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase
        .from('preferences')
        .select('preferences_data')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error loading preferences:', error);
        return new Response(JSON.stringify({ error: 'Failed to load preferences' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ preferences_data: data?.preferences_data ?? null }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST: Save preferences
    if (req.method === 'POST') {
      const body = await req.json();
      const { google_user_id, preferences_data } = body;

      if (!google_user_id || !preferences_data) {
        return new Response(JSON.stringify({ error: 'Missing google_user_id or preferences_data' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Look up the user's Supabase ID
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('google_user_id', google_user_id)
        .maybeSingle();

      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabase.from('preferences').upsert(
        {
          user_id: user.id,
          preferences_data,
          version: 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

      if (error) {
        console.error('Error saving preferences:', error);
        return new Response(JSON.stringify({ error: 'Failed to save preferences' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`Preferences saved for user: ${google_user_id}`);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
