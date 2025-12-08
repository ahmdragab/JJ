# Subscription System Design

## Overview
This document explains the new database structure for paid plans tied to credits, and how it compares to your current implementation.

## Current Structure vs. New Structure

### Current Structure (Simple)
```
user_credits
├── user_id (uuid)
├── credits (int) - just a number
└── timestamps
```

**Limitations:**
- No way to track where credits came from
- No subscription management
- No audit trail
- No support for different plans
- No one-time purchase support

### New Structure (Comprehensive)

```
plans
├── Defines available subscription plans
├── Pricing (monthly/yearly)
├── Credits per billing cycle
└── Features and metadata

subscriptions
├── Links users to plans
├── Tracks billing cycles
├── Handles renewals
└── Payment provider integration (Stripe, etc.)

credit_packages
├── One-time credit purchases
├── Different package sizes
└── Pricing

credit_transactions
├── Complete audit trail
├── Every credit change tracked
└── Source tracking (subscription, purchase, usage, etc.)

user_credits (enhanced)
├── Current credits balance
├── Plan reference
├── Lifetime credits purchased
└── Lifetime credits used
```

## Key Features

### 1. **Subscription Plans** (`plans` table)
- Define multiple tiers (Free, Starter, Pro, Enterprise)
- Monthly and yearly pricing
- Credits per billing cycle
- Rollover limits (optional)
- Feature flags/metadata

### 2. **User Subscriptions** (`subscriptions` table)
- One active subscription per user (can be modified)
- Tracks billing period (start/end dates)
- Status management (active, canceled, past_due, etc.)
- Payment provider integration (Stripe subscription ID)
- Automatic credit granting on renewal

### 3. **One-Time Purchases** (`credit_packages` table)
- Pre-defined credit packages
- Users can buy credits without subscription
- Flexible pricing

### 4. **Complete Audit Trail** (`credit_transactions` table)
- Every credit change is recorded
- Track source (subscription, purchase, usage, refund, etc.)
- Balance after each transaction
- Metadata for context (image_id, brand_id, etc.)

### 5. **Enhanced Credit Tracking**
- Lifetime credits purchased
- Lifetime credits used
- Plan association
- Better analytics

## Database Functions

### `add_credits()`
Adds credits with full transaction tracking. Use for:
- Subscription renewals
- One-time purchases
- Admin adjustments
- Refunds

### `deduct_credit()` (enhanced)
Deducts credits and records transaction. Now tracks:
- Usage source
- Metadata (image_id, etc.)
- Lifetime usage stats

### `grant_subscription_credits()`
Automatically grants credits when subscription renews. Handles:
- Monthly vs yearly billing
- Prevents duplicate grants
- Transaction recording

### `process_subscription_renewals()`
Cron/webhook function to:
- Process expired subscriptions
- Grant new period credits
- Update billing periods
- Handle cancellations

### `get_user_plan()`
Returns user's current plan details including:
- Plan information
- Subscription status
- Credits per period
- Current balance

## Migration Path

### Step 1: Run Migration
```sql
-- Run the migration file
-- This creates all new tables and functions
```

### Step 2: Insert Default Plans
```sql
INSERT INTO plans (name, display_name, description, price_monthly, credits_per_month, sort_order)
VALUES 
  ('free', 'Free Plan', 'Perfect for trying out the platform', 0, 10, 1),
  ('starter', 'Starter Plan', 'For small projects', 9.99, 100, 2),
  ('pro', 'Pro Plan', 'For professionals', 29.99, 500, 3);
```

### Step 3: Migrate Existing Users
```sql
-- Set all existing users to free plan
UPDATE user_credits
SET plan_id = (SELECT id FROM plans WHERE name = 'free')
WHERE plan_id IS NULL;
```

### Step 4: Create Initial Transactions
```sql
-- Create transaction records for existing credits
INSERT INTO credit_transactions (user_id, type, amount, balance_after, source, description)
SELECT 
  user_id,
  'granted',
  credits,
  credits,
  'migration',
  'Initial credits from migration'
FROM user_credits
WHERE credits > 0;
```

## Usage Examples

### Grant Credits on Subscription Purchase
```sql
-- When user subscribes (via Stripe webhook)
INSERT INTO subscriptions (user_id, plan_id, billing_cycle, current_period_start, current_period_end)
VALUES (...);

-- Grant initial credits
SELECT grant_subscription_credits(subscription_id);
```

### Grant Credits on One-Time Purchase
```sql
-- When user purchases credit package
SELECT add_credits(
  user_id,
  package_credits,
  'purchased',
  'credit_package',
  package_id,
  'Purchased credit package',
  '{}'::jsonb
);
```

### Check User's Plan
```sql
SELECT * FROM get_user_plan(user_id);
```

### Process Renewals (Cron Job)
```sql
-- Run daily/hourly via Supabase cron or webhook
SELECT process_subscription_renewals();
```

## Integration with Payment Providers

### Stripe Webhook Flow
1. **Subscription Created**
   - Create subscription record
   - Grant initial credits via `grant_subscription_credits()`

2. **Subscription Renewed**
   - Call `process_subscription_renewals()` or `grant_subscription_credits()`
   - Update subscription period

3. **Subscription Canceled**
   - Update subscription status
   - Set `cancel_at_period_end = true`

4. **One-Time Purchase**
   - Verify payment
   - Call `add_credits()` with package details

## Benefits Over Current Structure

1. **Scalability**: Easy to add new plans or features
2. **Transparency**: Complete audit trail of all credit changes
3. **Flexibility**: Supports both subscriptions and one-time purchases
4. **Analytics**: Track lifetime usage, popular plans, etc.
5. **Compliance**: Full transaction history for accounting
6. **User Experience**: Users can see where credits came from
7. **Business Intelligence**: Better insights into revenue and usage

## Next Steps

1. Run the migration
2. Insert your plan definitions
3. Set up Stripe webhooks (or your payment provider)
4. Update frontend to show plans and subscriptions
5. Set up cron job for subscription renewals
6. Create admin dashboard for plan management

## Notes

- The `deduct_credit()` function is backward compatible - existing code will continue to work
- All new functions use `SECURITY DEFINER` for proper access control
- RLS policies ensure users can only see their own data
- Consider adding indexes for frequently queried fields
- You may want to add a `credit_expiration` feature later (credits expire after X days)



