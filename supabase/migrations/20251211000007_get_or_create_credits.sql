/*
  # Get or Create Credits Function (Safe Version)
  
  Creates credits on first access instead of relying on triggers.
  Uses auth.uid() to ensure users can only access their own credits.
*/

-- Drop the old function if it exists
DROP FUNCTION IF EXISTS get_or_create_credits(uuid);

-- Create safer version that validates the caller
CREATE OR REPLACE FUNCTION get_or_create_credits()
RETURNS int AS $$
DECLARE
  current_credits int;
  calling_user_id uuid;
BEGIN
  -- Get the authenticated user's ID
  calling_user_id := auth.uid();
  
  -- If no authenticated user, return 0
  IF calling_user_id IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Try to get existing credits
  SELECT credits INTO current_credits
  FROM user_credits
  WHERE user_id = calling_user_id;
  
  -- If no record exists, create one with 20 credits
  IF current_credits IS NULL THEN
    INSERT INTO user_credits (user_id, credits, lifetime_credits_added, lifetime_credits_used)
    VALUES (calling_user_id, 20, 20, 0)
    ON CONFLICT (user_id) DO NOTHING;
    
    -- Get the credits again (in case of race condition)
    SELECT credits INTO current_credits
    FROM user_credits
    WHERE user_id = calling_user_id;
    
    -- If still null, return 20 (the default)
    IF current_credits IS NULL THEN
      RETURN 20;
    END IF;
  END IF;
  
  RETURN current_credits;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_or_create_credits() TO authenticated;

