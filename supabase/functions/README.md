# Supabase Edge Functions

This directory contains Supabase Edge Functions that run in Deno and are deployed separately from the main extension.

## Important Notes

- **These files will show TypeScript errors in VS Code** because they use Deno-specific imports (URLs) and the `Deno` runtime. This is expected.
- These functions are NOT bundled with the extension. They are deployed directly to Supabase.
- The `supabase/functions/` directory follows Supabase's expected structure.

## Available Functions

### `stripe-checkout`
Creates a Stripe Checkout session for upgrading to Pro (one-time $20 payment).

**Input:**
```json
{
  "google_user_id": "string",
  "email": "string",
  "success_url": "optional string",
  "cancel_url": "optional string"
}
```

**Output:**
```json
{
  "checkout_url": "https://checkout.stripe.com/..."
}
```

### `stripe-webhook`
Handles Stripe webhook events and updates user subscription status.

**Handles events:**
- `checkout.session.completed` - Upgrades user to Pro
- `charge.refunded` - Downgrades user to Free

## Deployment

### Prerequisites
1. Install Supabase CLI: `npm install -g supabase`
2. Login: `supabase login`
3. Link to project: `supabase link --project-ref YOUR_PROJECT_REF`

### Set Secrets
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set STRIPE_PRICE_ID=price_...
```

### Deploy
```bash
# Deploy all functions
supabase functions deploy

# Or deploy individually
supabase functions deploy stripe-checkout
supabase functions deploy stripe-webhook
```

## Stripe Dashboard Setup

1. Create a product: "Canvas2Calendar Pro"
2. Create a one-time price: $20.00
3. Create webhook endpoint pointing to:
   `https://YOUR_PROJECT.supabase.co/functions/v1/stripe-webhook`
4. Select events: `checkout.session.completed`, `charge.refunded`

## Local Testing

```bash
# Serve functions locally
supabase functions serve --env-file .env.local

# In another terminal, test with Stripe CLI
stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook
stripe trigger checkout.session.completed
```
