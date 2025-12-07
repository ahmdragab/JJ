/*
  # User Credits System
  
  Creates a table to track user credits for image generation.
  Each image generation deducts 1 credit.
*/

-- Create user_credits table
CREATE TABLE IF NOT EXISTS user_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL UNIQUE,
  credits int DEFAULT 20 NOT NULL, -- Default 20 credits for new users
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

-- Users can view their own credits
CREATE POLICY "Users can view own credits"
  ON user_credits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own credits (for admin operations)
CREATE POLICY "Users can update own credits"
  ON user_credits FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Function to automatically create credits record for new users
CREATE OR REPLACE FUNCTION create_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_credits (user_id, credits)
  VALUES (NEW.id, 20)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create credits when a user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_credits();

-- Function to deduct credits (returns true if successful, false if insufficient)
CREATE OR REPLACE FUNCTION deduct_credit(user_uuid uuid, amount int DEFAULT 1)
RETURNS boolean AS $$
DECLARE
  current_credits int;
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
  
  -- Deduct credits
  UPDATE user_credits
  SET credits = credits - amount,
      updated_at = now()
  WHERE user_id = user_uuid;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create index for performance
CREATE INDEX IF NOT EXISTS user_credits_user_id_idx ON user_credits(user_id);

