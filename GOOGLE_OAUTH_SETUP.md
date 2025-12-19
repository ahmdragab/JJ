# Google OAuth Setup Guide

This guide will walk you through setting up Google sign-in for your application.

## Prerequisites

- A Google Cloud Platform (GCP) account
- Access to your Supabase project dashboard

## Step 1: Create Google OAuth Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** → **Credentials**
4. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
5. If prompted, configure the OAuth consent screen first:
   - Choose **External** (unless you have a Google Workspace)
   - Fill in the required fields:
     - App name: Your app name
     - User support email: Your email
     - Developer contact information: Your email
   - Click **Save and Continue** through the scopes (you can skip adding scopes)
   - Add test users if your app is in testing mode
   - Click **Save and Continue** to finish

6. Back in Credentials, create the OAuth client ID:
   - Application type: **Web application**
   - Name: Your app name (e.g., "JJ Design Generator")
   - Authorized JavaScript origins:
     - Add your production URL: `https://yourdomain.com`
     - Add your local development URL: `http://localhost:5173` (or your Vite dev port)
   - Authorized redirect URIs:
     - Add: `https://YOUR_SUPABASE_PROJECT_REF.supabase.co/auth/v1/callback`
     - Replace `YOUR_SUPABASE_PROJECT_REF` with your actual Supabase project reference
     - You can find this in your Supabase dashboard URL or project settings

7. Click **Create**
8. Copy the **Client ID** and **Client Secret** (you'll need these in the next step)

## Step 2: Configure Supabase

1. Go to your [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Navigate to **Authentication** → **Providers**
4. Find **Google** in the list and click on it
5. Toggle **Enable Google provider** to ON
6. Enter your **Client ID** and **Client Secret** from Step 1
7. Click **Save**

## Step 3: Verify Redirect URLs

Make sure your Supabase redirect URL matches what you added in Google Cloud Console:
- Format: `https://YOUR_SUPABASE_PROJECT_REF.supabase.co/auth/v1/callback`
- You can find your project reference in:
  - Supabase Dashboard → Settings → API → Project URL
  - Or in your `.env` file as `VITE_SUPABASE_URL`

## Step 4: Test the Integration

1. Start your development server
2. Click the "Sign In" button on your landing page
3. Click "Continue with Google"
4. You should be redirected to Google's sign-in page
5. After signing in, you'll be redirected back to your app
6. The user should be automatically signed in

## Troubleshooting

### "redirect_uri_mismatch" Error
- Make sure the redirect URI in Google Cloud Console exactly matches:
  `https://YOUR_SUPABASE_PROJECT_REF.supabase.co/auth/v1/callback`
- Check for typos, trailing slashes, or protocol mismatches (http vs https)

### "Invalid client" Error
- Verify your Client ID and Client Secret are correct in Supabase
- Make sure you copied the entire Client ID (it's a long string)

### User Not Created After Google Sign-In
- Check that your `create_user_credits()` trigger is working
- Verify in Supabase Dashboard → Authentication → Users that the user was created
- Check the database logs for any trigger errors

### Local Development Issues
- Make sure `http://localhost:5173` (or your dev port) is added to Authorized JavaScript origins
- The redirect will still go through Supabase, so the redirect URI should be the Supabase callback URL, not localhost

## Security Notes

- Never commit your Client Secret to version control
- Keep your Client Secret secure - it's stored in Supabase and not exposed to the frontend
- For production, make sure to add your production domain to Authorized JavaScript origins
- Consider restricting OAuth to specific email domains if this is an internal tool

## Additional Resources

- [Supabase OAuth Documentation](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)







