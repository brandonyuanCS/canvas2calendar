-- Migration: Add Free Trial Support
-- Date: 2026-01-31
-- Description: Adds trial_started_at, payment_status, and deleted_at fields to support 14-day free trial model

-- Step 1: Add new columns (nullable first for existing data)
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_status TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Step 2: Backfill trial_started_at for existing users (use created_at as best approximation)
UPDATE users 
SET trial_started_at = created_at 
WHERE trial_started_at IS NULL;

-- Step 3: Backfill payment_status for existing users
-- Assume existing 'pro' users have paid, others are unpaid
UPDATE users
SET payment_status = CASE
  WHEN subscription_tier = 'pro' THEN 'paid'
  ELSE 'unpaid'
END
WHERE payment_status IS NULL;

-- Step 4: Make trial_started_at non-nullable after backfill
ALTER TABLE users 
  ALTER COLUMN trial_started_at SET NOT NULL,
  ALTER COLUMN trial_started_at SET DEFAULT NOW();

-- Step 5: Add constraint to payment_status
ALTER TABLE users
  ADD CONSTRAINT check_payment_status 
  CHECK (payment_status IN ('unpaid', 'paid', 'refunded'));

-- Step 6: Set default for payment_status
ALTER TABLE users 
  ALTER COLUMN payment_status SET DEFAULT 'unpaid';

-- Step 7: Remove subscription_subscription_id column (no longer needed for one-time payment)
ALTER TABLE users DROP COLUMN IF EXISTS stripe_subscription_id;

-- Step 8: Create index for soft-delete queries
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;

-- Verification queries (run these manually to check migration):
-- SELECT COUNT(*) FROM users WHERE trial_started_at IS NULL; -- Should be 0
-- SELECT COUNT(*) FROM users WHERE payment_status IS NULL; -- Should be 0
-- SELECT payment_status, COUNT(*) FROM users GROUP BY payment_status;
