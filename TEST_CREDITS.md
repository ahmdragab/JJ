# Testing the Credits System

After pushing the migration, test these scenarios:

## 1. Test New User Signup (Should get 20 credits)

1. Create a new test account
2. Check that they automatically get 20 credits
3. Verify a transaction record was created in `credit_transactions`

**SQL to verify:**
```sql
-- Check new user's credits
SELECT * FROM user_credits WHERE user_id = 'new-user-id';

-- Check transaction was created
SELECT * FROM credit_transactions WHERE user_id = 'new-user-id';
```

## 2. Test Credit Deduction (Existing Code)

1. Generate an image (should deduct 1 credit)
2. Verify credit balance decreased
3. Verify transaction was recorded

**SQL to verify:**
```sql
-- Check credits decreased
SELECT credits FROM user_credits WHERE user_id = 'your-user-id';

-- Check transaction was recorded
SELECT * FROM credit_transactions 
WHERE user_id = 'your-user-id' 
ORDER BY created_at DESC 
LIMIT 5;
```

## 3. Test Admin Credit Assignment

**In Supabase SQL Editor:**
```sql
-- Get your user ID first
SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';

-- Add 50 credits
SELECT add_credits(
  'your-user-id-here'::uuid,
  50,
  'Test credit assignment'
);

-- Verify it worked
SELECT 
  credits,
  lifetime_credits_added,
  lifetime_credits_used
FROM user_credits 
WHERE user_id = 'your-user-id-here';

-- Check transaction
SELECT * FROM credit_transactions 
WHERE user_id = 'your-user-id-here'
ORDER BY created_at DESC 
LIMIT 1;
```

## 4. Verify Existing Users Still Work

1. Existing users should keep their current credits
2. Their next credit deduction should create a transaction record
3. Lifetime stats should start tracking from now

## Quick Health Check

Run this to see overall system status:

```sql
-- Count users with credits
SELECT COUNT(*) as total_users FROM user_credits;

-- Count total transactions
SELECT COUNT(*) as total_transactions FROM credit_transactions;

-- See credit distribution
SELECT 
  CASE 
    WHEN credits = 0 THEN '0 credits'
    WHEN credits < 10 THEN '1-9 credits'
    WHEN credits < 50 THEN '10-49 credits'
    WHEN credits < 100 THEN '50-99 credits'
    ELSE '100+ credits'
  END as credit_range,
  COUNT(*) as user_count
FROM user_credits
GROUP BY credit_range
ORDER BY credit_range;
```





