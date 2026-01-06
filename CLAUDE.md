# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JJ is a full-stack AI-powered brand design studio that extracts brand guidelines from websites and generates AI-powered designs/images. Built with React 18 + TypeScript + Vite frontend and Supabase backend with Deno Edge Functions.

## Commands

```bash
npm run dev       # Start Vite dev server with hot reload
npm run build     # Production build
npm run lint      # ESLint with TypeScript support
npm run typecheck # TypeScript type checking (no emit)
npm run preview   # Preview production build locally
```

## Architecture

### Frontend Structure
- **Pages** (`src/pages/`): Route-level components. `Studio.tsx` is the main design hub, `Landing.tsx` handles entry/auth, `BrandKitEditor.tsx` manages brand settings.
- **Components** (`src/components/`): Reusable UI (pickers, dialogs, navbar). Uses props drilling for data flow.
- **Contexts** (`src/contexts/AuthContext.tsx`): Single context for user authentication and session management.
- **Lib** (`src/lib/`): Core utilities - `supabase.ts` contains 40+ DB types/functions, `admin.ts` for admin checks, `smartPresets.ts` for cached template generation.

### Backend (Supabase Edge Functions)
Located in `supabase/functions/`, each in its own directory:
- `extract-brand/` - Brand.dev API for website brand extraction
- `generate-image/` - Gemini 3 Pro image generation (primary)
- `edit-image/` - Image editing with Gemini
- `generate-copy/` - OpenAI GPT-4o-mini for text generation
- `create-checkout/` & `stripe-webhook/` - Stripe payment flow
- `_shared/` - Shared utilities (Axiom logging, Sentry)

### API Communication Pattern
Direct fetch calls to Supabase Edge Functions with Bearer token auth:
```typescript
const response = await fetch(`${supabaseUrl}/functions/v1/{function-name}`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
});
```
Handle 402 status for insufficient credits.

### Routing
React Router v7 with protected route wrappers:
- `ProtectedRoute` - Requires authenticated user
- `AdminRoute` - Requires admin user (checked via `VITE_ADMIN_USER_IDS` env var)
- Brand-scoped routes: `/brands/{brandSlug}/studio`, `/brands/{brandSlug}/editor`

### Data Flow
1. User enters domain → `extract-brand` function extracts brand data
2. Brand stored in DB with colors, fonts, logos, voice
3. User generates images in Studio → `generate-image` function called
4. Generated images stored with conversation history for editing
5. Credits deducted per generation (RPC: `get_or_create_credits`)

## Key Files

- `src/lib/supabase.ts` - Database client, types (Brand, GeneratedImage, Style, etc.), utility functions
- `src/contexts/AuthContext.tsx` - Supabase Auth with Google OAuth
- `src/pages/Studio.tsx` - Main design hub (largest file ~158KB)
- `src/lib/colors.ts` - Brand color palette constants

## Environment Variables

Frontend (`.env`):
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` - Supabase connection
- `VITE_SENTRY_DSN` - Error tracking (optional)
- `VITE_ADMIN_USER_IDS` - Comma-separated admin user IDs

Supabase secrets (set in dashboard):
- `GEMINI_API_KEY`, `OPENAI_API_KEY`, `BRAND_DEV_API_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `AXIOM_TOKEN`, `AXIOM_DATASET` - Structured logging

## Styling

Tailwind CSS v3 with custom config:
- Primary color: `#3531B7` (Royal Blue)
- Custom `playful` font family (Poppins)
- Custom animations in `tailwind.config.js`
- Icon library: Lucide React

## Database

Supabase PostgreSQL with RLS (Row-Level Security) enforced via `user_id` filtering. Key tables:
- `brands` - Brand with colors, fonts, logos, styleguide
- `generated_images` - Prompt, edit history, metadata
- `styles` - Admin-managed design styles
- `user_credits` - Credit balance and usage tracking
