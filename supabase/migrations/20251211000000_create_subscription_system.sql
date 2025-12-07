/*
  # Enhanced Credits System
  
  Adds credit transaction tracking and admin functions for assigning credits.
  Updates default signup credits to 20.
*/

-- ============================================================================
-- 1. CREDIT TRANSACTIONS TABLE
-- ============================================================================
-- Audit trail for all credit changes (additions, deductions, refunds)
CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  type text NOT NULL, -- 'granted' (subscription), 'purchased' (one-time), 'deducted' (usage), 'refunded', 'expired', 'admin_adjustment'
  amount int NOT NULL, -- Positive for additions, negative for deductions
  balance_after int NOT NULL, -- Credits balance after this transaction
  source text, -- 'subscription', 'credit_package', 'usage', 'admin', etc.
  source_id uuid, -- ID of subscription, credit_package, or other source
  description text, -- Human-readable description
  metadata jsonb DEFAULT '{}' NOT NULL, -- Additional context (image_id, brand_id, etc.)
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own transactions
CREATE POLICY "Users can view own credit transactions"
  ON credit_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS credit_transactions_user_id_idx ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS credit_transactions_created_at_idx ON credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS credit_transactions_type_idx ON credit_transactions(type);

-- ============================================================================
-- 2. UPDATE USER_CREDITS TABLE
-- ============================================================================
-- Add lifetime credits tracking (optional, for analytics)
ALTER TABLE user_credits 
  ADD COLUMN IF NOT EXISTS lifetime_credits_added int DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS lifetime_credits_used int DEFAULT 0 NOT NULL;

-- ============================================================================
-- 3. FUNCTIONS
-- ============================================================================

-- Function to add credits with transaction tracking (for admin use)
CREATE OR REPLACE FUNCTION add_credits(
  user_uuid uuid,
  amount int,
  description text DEFAULT NULL,
  metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean AS $$
DECLARE
  current_credits int;
  new_balance int;
BEGIN
  -- Get or create user credits record
  INSERT INTO user_credits (user_id, credits)
  VALUES (user_uuid, 0)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Get current credits
  SELECT credits INTO current_credits
  FROM user_credits
  WHERE user_id = user_uuid;
  
  -- Calculate new balance
  new_balance := current_credits + amount;
  
  -- Update credits
  UPDATE user_credits
  SET credits = new_balance,
      updated_at = now(),
      lifetime_credits_added = lifetime_credits_added + amount
  WHERE user_id = user_uuid;
  
  -- Record transaction
  INSERT INTO credit_transactions (
    user_id,
    type,
    amount,
    balance_after,
    source,
    description,
    metadata
  ) VALUES (
    user_uuid,
    'admin_adjustment',
    amount,
    new_balance,
    'admin',
    COALESCE(description, 'Credits added by admin'),
    metadata
  );
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced deduct_credit function with transaction tracking
CREATE OR REPLACE FUNCTION deduct_credit(
  user_uuid uuid,
  amount int DEFAULT 1,
  description text DEFAULT NULL,
  metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean AS $$
DECLARE
  current_credits int;
  new_balance int;
BEGIN
  -- Get current credits
  SELECT credits INTO current_credits
  FROM user_credits
  WHERE user_id = user_uuid;
  
  -- If user doesn't have a credits record, create one with 0 credits
  IF current_credits IS NULL THEN
    INSERT INTO user_credits (user_id, credits)
    VALUES (user_uuid, 0)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN false;
  END IF;
  
  -- Check if user has enough credits
  IF current_credits < amount THEN
    RETURN false;
  END IF;
  
  -- Calculate new balance
  new_balance := current_credits - amount;
  
  -- Deduct credits
  UPDATE user_credits
  SET credits = new_balance,
      updated_at = now(),
      lifetime_credits_used = lifetime_credits_used + amount
  WHERE user_id = user_uuid;
  
  -- Record transaction
  INSERT INTO credit_transactions (
    user_id,
    type,
    amount,
    balance_after,
    source,
    description,
    metadata
  ) VALUES (
    user_uuid,
    'deducted',
    -amount,
    new_balance,
    'usage',
    COALESCE(description, 'Credit used for image generation'),
    metadata
  );
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. UPDATE DEFAULT SIGNUP CREDITS TO 20
-- ============================================================================
-- Update the function that creates credits for new users
CREATE OR REPLACE FUNCTION create_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_credits (user_id, credits, lifetime_credits_added)
  VALUES (NEW.id, 20, 20)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Record the initial transaction
  INSERT INTO credit_transactions (
    user_id,
    type,
    amount,
    balance_after,
    source,
    description
  ) VALUES (
    NEW.id,
    'granted',
    20,
    20,
    'signup',
    'Welcome credits for new user'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

