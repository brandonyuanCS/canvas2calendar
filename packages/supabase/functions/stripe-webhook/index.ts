// Supabase Edge Function: stripe-webhook
// Handles Stripe webhook events to update user subscription status

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import Stripe from 'https://esm.sh/stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
});

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  try {
    const body = await req.text();

    // Verify webhook signature (use async version for Deno)
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);

    console.log('Received Stripe event:', event.type);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle relevant events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // Only process one-time payments (not subscriptions)
        if (session.mode === 'payment' && session.payment_status === 'paid') {
          const googleUserId = session.metadata?.google_user_id;

          if (googleUserId) {
            console.log(`Upgrading user ${googleUserId} to Pro`);

            // Update user to Pro tier with paid status
            const { error } = await supabase
              .from('users')
              .update({
                payment_status: 'paid',
                subscription_tier: 'pro',
                stripe_customer_id: session.customer as string,
                updated_at: new Date().toISOString(),
              })
              .eq('google_user_id', googleUserId);

            if (error) {
              console.error('Failed to update user:', error);
              return new Response(JSON.stringify({ error: 'Database update failed' }), { status: 500 });
            }

            console.log(`User ${googleUserId} upgraded to Pro successfully`);
          }
        }
        break;
      }

      case 'payment_intent.succeeded': {
        // Alternative event for one-time payments
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('Payment succeeded:', paymentIntent.id);
        // The checkout.session.completed event handles the upgrade
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('Payment failed:', paymentIntent.id, paymentIntent.last_payment_error?.message);
        break;
      }

      // Handle refunds - mark payment as refunded (user may still have trial access)
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const customerId = charge.customer as string;

        if (customerId) {
          // Find user by stripe_customer_id and update payment status
          const { error } = await supabase
            .from('users')
            .update({
              payment_status: 'refunded',
              subscription_tier: 'free',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_customer_id', customerId);

          if (error) {
            console.error('Failed to update user after refund:', error);
          } else {
            console.log('User payment status updated to refunded');
          }
        }
        break;
      }

      default:
        console.log('Unhandled event type:', event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);

    if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
      return new Response('Invalid signature', { status: 400 });
    }

    return new Response(JSON.stringify({ error: error.message || 'Webhook handler failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
