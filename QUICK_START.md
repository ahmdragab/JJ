# Quick Start Guide - New Supabase Project

## Step 1: Create `.env` file

Create a `.env` file in the root directory with your new Supabase credentials:

```bash
# Copy the example file
cp .env.example .env
```

Then edit `.env` and add your Supabase project credentials:
- Get `VITE_SUPABASE_URL` from: Supabase Dashboard > Project Settings > API > Project URL
- Get `VITE_SUPABASE_ANON_KEY` from: Supabase Dashboard > Project Settings > API > anon/public key

## Step 2: Run Database Migration

**Option A: Via Supabase Dashboard (Easiest)**
1. Go to your Supabase Dashboard > SQL Editor
2. Open `supabase/migrations/20251205131710_create_core_schema.sql`
3. Copy all the SQL code
4. Paste into SQL Editor and click "Run"

**Option B: Via Supabase CLI**
```bash
supabase link --project-ref your-project-ref
supabase db push
```

## Step 3: Deploy Edge Functions

**Option A: Via Supabase Dashboard**
1. Go to Edge Functions in dashboard
2. Deploy each function:
   - `extract-brand` (from `supabase/functions/extract-brand/index.ts`)
   - `generate-design` (from `supabase/functions/generate-design/index.ts`)
   - `generate-copy` (from `supabase/functions/generate-copy/index.ts`)
   - `generate-image` (from `supabase/functions/generate-image/index.ts`)

**Option B: Via Supabase CLI**
```bash
supabase functions deploy extract-brand
supabase functions deploy generate-design
supabase functions deploy generate-copy
supabase functions deploy generate-image
```

## Step 4: Set Brand.dev API Key Secret

**Via Dashboard:**
1. Go to Project Settings > Edge Functions > Secrets
2. Add secret: `BRAND_DEV_API_KEY` = `your-api-key-from-brand.dev`

**Via CLI:**
```bash
supabase secrets set BRAND_DEV_API_KEY=your-api-key-here
```

## Step 5: Test It!

```bash
npm run dev
```

Open the app and try:
1. Sign up / Sign in
2. Enter a website URL to extract brand
3. Generate a design

---

**Note:** Edge functions automatically have access to `SUPABASE_URL` and `SUPABASE_ANON_KEY` - you don't need to set these as secrets.

