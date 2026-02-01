-- Canvas2Calendar Database Schema
-- Run this in your Supabase SQL Editor

-- ============= Users Table =============

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_user_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  
  -- Trial tracking (server-authoritative, set once on creation)
  trial_started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Payment tracking for one-time payment model
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'max')),
  
  -- Stripe integration
  stripe_customer_id TEXT,
  
  -- Soft delete for anti-abuse (prevents delete & re-register)
  deleted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view/update their own data
CREATE POLICY "Users can view own data" ON users
  FOR SELECT
  USING (auth.jwt() ->> 'sub' = google_user_id);

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE
  USING (auth.jwt() ->> 'sub' = google_user_id);

-- Policy: Allow insert for authenticated users (for upsert)
CREATE POLICY "Authenticated users can insert" ON users
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ============= Preferences Table =============

CREATE TABLE IF NOT EXISTS preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  preferences_data JSONB NOT NULL DEFAULT '{}',
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage their own preferences
CREATE POLICY "Users can manage own preferences" ON preferences
  FOR ALL
  USING (
    user_id IN (
      SELECT id FROM users 
      WHERE google_user_id = auth.jwt() ->> 'sub'
    )
  );

-- ============= Indexes =============

CREATE INDEX IF NOT EXISTS idx_users_google_user_id ON users(google_user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_preferences_user_id ON preferences(user_id);

-- ============= Updated At Trigger =============

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_preferences_updated_at
  BEFORE UPDATE ON preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
