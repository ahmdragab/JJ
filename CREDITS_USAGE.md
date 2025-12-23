# Credits System Usage Guide

## Overview
Simple credits system for managing user credits. New users automatically get **20 credits** on signup.

## Key Features

1. **Automatic Signup Credits**: New users get 20 credits automatically
2. **Transaction Tracking**: All credit changes are logged in `credit_transactions`
3. **Admin Credit Assignment**: Easy function to add credits to any user
4. **Usage Tracking**: Credits are automatically deducted and tracked when used

## Database Structure

### `user_credits` Table
- `user_id` - User reference
- `credits` - Current credit balance
- `lifetime_credits_added` - Total credits ever added
- `lifetime_credits_used` - Total credits ever used

### `credit_transactions` Table
- Complete audit trail of all credit changes
- Tracks: additions, deductions, source, description, metadata

## Functions

### 1. Add Credits to a User (Admin)

```sql
-- Add 100 credits to a user
SELECT add_credits(
  'user-uuid-here'::uuid,
  100,
  'Promotional credits for referral'
);
```

**Parameters:**
- `user_uuid` - The user's UUID
- `amount` - Number of credits to add (positive integer)
- `description` - Optional description (defaults to "Credits added by admin")
- `metadata` - Optional JSON metadata (defaults to empty object)

**Example with metadata:**
```sql
SELECT add_credits(
  'user-uuid-here'::uuid,
  50,
  'Bonus credits for completing tutorial',
  '{"campaign": "tutorial_completion", "date": "2024-12-11"}'::jsonb
);
```

### 2. Deduct Credits (Automatic)

The `deduct_credit()` function is automatically called when users generate images. You can also call it manually:

```sql
SELECT deduct_credit(
  'user-uuid-here'::uuid,
  1,  -- amount to deduct
  'Manual credit deduction',
  '{"reason": "refund"}'::jsonb
);
```

### 3. Get User Credits

```sql
-- Get current credits
SELECT credits FROM user_credits WHERE user_id = 'user-uuid-here';

-- Get full credit info including lifetime stats
SELECT 
  credits,
  lifetime_credits_added,
  lifetime_credits_used
FROM user_credits 
WHERE user_id = 'user-uuid-here';
```

### 4. View Credit Transactions

```sql
-- Get all transactions for a user
SELECT 
  type,
  amount,
  balance_after,
  description,
  created_at
FROM credit_transactions
WHERE user_id = 'user-uuid-here'
ORDER BY created_at DESC;
```

## Usage Examples

### Assign Credits via Supabase Dashboard

1. Go to Supabase Dashboard → SQL Editor
2. Run:

```sql
-- Find user by email
SELECT id, email FROM auth.users WHERE email = 'user@example.com';

-- Add credits (replace with actual user ID)
SELECT add_credits(
  'user-id-from-above'::uuid,
  100,
  'Admin credit assignment'
);
```

### Assign Credits via Edge Function

```typescript
// In your Supabase Edge Function
const { data, error } = await supabase.rpc('add_credits', {
  user_uuid: userId,
  amount: 100,
  description: 'Promotional credits',
  metadata: { source: 'promo_campaign_2024' }
});
```

### Check User's Credit History

```sql
-- View complete credit history for a user
SELECT 
  ct.type,
  ct.amount,
  ct.balance_after,
  ct.description,
  ct.source,
  ct.created_at
FROM credit_transactions ct
WHERE ct.user_id = 'user-uuid-here'
ORDER BY ct.created_at DESC
LIMIT 50;
```

## Transaction Types

- `granted` - Credits granted (signup, promotions)
- `admin_adjustment` - Credits added/removed by admin
- `deducted` - Credits used for image generation
- `refunded` - Credits refunded (future use)
- `expired` - Credits expired (future use)

## Notes

- All functions use `SECURITY DEFINER` for proper access control
- Users can only view their own credit transactions (RLS enforced)
- The `deduct_credit()` function automatically tracks usage
- New users get 20 credits automatically on signup
- All credit changes are logged in `credit_transactions` for audit purposes














