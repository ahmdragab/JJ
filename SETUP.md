# Setting Up BrandFlow with a New Supabase Project

Follow these steps to set up this project with your new Supabase project.

## 1. Get Your Supabase Project Credentials

1. Go to your Supabase project dashboard: https://app.supabase.com
2. Select your project
3. Go to **Project Settings** > **API**
4. Copy the following:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (the `anon` key under Project API keys)

## 2. Configure Environment Variables

1. Copy `.env.example` to `.env` (if not already done):
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and fill in your Supabase credentials:
   ```
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

## 3. Set Up the Database Schema

Run the migration to create all necessary tables:

### Option A: Using Supabase Dashboard (Recommended)

1. Go to **SQL Editor** in your Supabase dashboard
2. Open the file: `supabase/migrations/20251205131710_create_core_schema.sql`
3. Copy the entire contents
4. Paste into the SQL Editor
5. Click **Run** to execute the migration

### Option B: Using Supabase CLI

If you have Supabase CLI installed:

```bash
# Link to your project (if not already linked)
supabase link --project-ref your-project-ref

# Run the migration
supabase db push
```

## 4. Deploy Edge Functions

Deploy all edge functions to your Supabase project:

### Option A: Using Supabase Dashboard

1. Go to **Edge Functions** in your Supabase dashboard
2. For each function in `supabase/functions/`:
   - Click **Create a new function**
   - Name it: `extract-brand`, `generate-design`, `generate-copy`, `generate-image`
   - Copy the code from the corresponding `index.ts` file
   - Deploy

### Option B: Using Supabase CLI

```bash
# Deploy all functions
supabase functions deploy extract-brand
supabase functions deploy generate-design
supabase functions deploy generate-copy
supabase functions deploy generate-image
```

## 5. Set Up Edge Function Secrets

Set the Brand.dev API key as a secret for your edge functions:

### Option A: Using Supabase Dashboard

1. Go to **Project Settings** > **Edge Functions** > **Secrets**
2. Add a new secret:
   - **Name**: `BRAND_DEV_API_KEY`
   - **Value**: Your Brand.dev API key (get it from https://www.brand.dev/signup)

### Option B: Using Supabase CLI

```bash
supabase secrets set BRAND_DEV_API_KEY=your-brand-dev-api-key
```

## 6. Verify Setup

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Open the app in your browser
3. Try signing up/logging in
4. Try extracting a brand from a website URL

## Troubleshooting

### Environment Variables Not Loading

- Make sure `.env` is in the root directory
- Restart your dev server after changing `.env`
- Check that variable names start with `VITE_` for Vite projects

### Database Errors

- Verify the migration ran successfully
- Check that Row Level Security (RLS) policies are enabled
- Ensure you're authenticated when testing

### Edge Function Errors

- Check that functions are deployed
- Verify secrets are set correctly
- Check function logs in Supabase dashboard

### Brand Extraction Not Working

- Verify `BRAND_DEV_API_KEY` secret is set
- Check edge function logs for API errors
- Ensure you have a valid Brand.dev API key

## Next Steps

- Add some template data to the `templates` table for design generation
- Customize the brand extraction logic if needed
- Set up production environment variables

