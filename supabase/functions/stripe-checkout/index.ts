// Supabase Edge Function: stripe-checkout
// Creates a Stripe Checkout session for one-time Pro upgrade

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import Stripe from 'https://esm.sh/stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
});

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CheckoutRequest {
  google_user_id: string;
  email: string;
  success_url?: string;
  cancel_url?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { google_user_id, email, success_url, cancel_url }: CheckoutRequest = await req.json();

    if (!google_user_id || !email) {
      return new Response(JSON.stringify({ error: 'Missing google_user_id or email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user already has Pro (prevent duplicate purchases)
    const { data: existingUser } = await supabase
      .from('users')
      .select('subscription_tier, stripe_customer_id')
      .eq('google_user_id', google_user_id)
      .single();

    if (existingUser?.subscription_tier === 'pro') {
      return new Response(JSON.stringify({ error: 'User already has Pro subscription' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create or retrieve Stripe customer
    let customerId = existingUser?.stripe_customer_id;

    if (!customerId) {
      // Search for existing customer by email
      const existingCustomers = await stripe.customers.list({ email, limit: 1 });

      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id;
      } else {
        // Create new customer
        const customer = await stripe.customers.create({
          email,
          metadata: { google_user_id },
        });
        customerId = customer.id;
      }

      // Save Stripe customer ID to user record
      await supabase.from('users').update({ stripe_customer_id: customerId }).eq('google_user_id', google_user_id);
    }

    // Create Checkout Session for one-time payment
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment', // One-time payment
      payment_method_types: ['card'],
      line_items: [
        {
          price: Deno.env.get('STRIPE_PRICE_ID'), // $20 one-time price
          quantity: 1,
        },
      ],
      success_url: success_url || 'https://canvas2calendar.com/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancel_url || 'https://canvas2calendar.com/cancel',
      metadata: {
        google_user_id,
        product: 'canvas2calendar_pro',
      },
    });

    return new Response(JSON.stringify({ checkout_url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Checkout error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Failed to create checkout session' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
