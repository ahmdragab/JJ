/*
  # Initialize Existing Users
  
  This migration initializes lifetime_credits_added for existing users
  based on their current credit balance. This is a one-time data migration.
  
  Run this AFTER the main subscription system migration.
*/

-- Initialize lifetime_credits_added for existing users
-- Assumes their current credits were all granted (since we don't have historical data)
UPDATE user_credits
SET lifetime_credits_added = credits
WHERE lifetime_credits_added = 0 
  AND credits > 0;

-- Optional: Create initial transaction records for existing users
-- This backfills transaction history for users who already have credits
INSERT INTO credit_transactions (user_id, type, amount, balance_after, source, description)
SELECT 
  user_id,
  'granted' as type,
  credits as amount,
  credits as balance_after,
  'migration' as source,
  'Initial credits (migrated from previous system)' as description
FROM user_credits
WHERE credits > 0
  AND NOT EXISTS (
    SELECT 1 FROM credit_transactions 
    WHERE credit_transactions.user_id = user_credits.user_id
  );












