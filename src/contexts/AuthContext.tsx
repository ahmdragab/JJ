import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, AuthChangeEvent } from '@supabase/supabase-js';
import * as Sentry from '@sentry/react';
import { supabase } from '../lib/supabase';
import { track, identify, reset } from '../lib/analytics';

// Storage key for tracking email confirmation
const EMAIL_CONFIRMED_KEY = 'jj_email_confirmed';

type AuthContextType = {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const previousUserIdRef = useRef<string | null>(null);
  const pendingAuthMethod = useRef<'email' | 'google' | null>(null);

  // Helper to identify user in analytics
  const identifyUser = (user: User) => {
    identify(user.id, {
      email: user.email,
      created_at: user.created_at,
    });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null;
      setUser(user);
      setLoading(false);

      // Set user context in Sentry
      if (user) {
        Sentry.setUser({
          id: user.id,
          email: user.email,
        });
        // Identify user in analytics on initial load
        identifyUser(user);
        previousUserIdRef.current = user.id;
      } else {
        Sentry.setUser(null);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session) => {
      const newUser = session?.user ?? null;

      // Set user context in Sentry
      if (newUser) {
        Sentry.setUser({
          id: newUser.id,
          email: newUser.email,
        });
      } else {
        Sentry.setUser(null);
      }

      // Track auth events based on state changes
      const wasLoggedIn = previousUserIdRef.current !== null;
      const isNowLoggedIn = newUser !== null;
      const userChanged = previousUserIdRef.current !== newUser?.id;

      if (userChanged) {
        if (isNowLoggedIn && !wasLoggedIn) {
          // User logged in
          identifyUser(newUser);

          const method = newUser.app_metadata?.provider === 'google' ? 'google' : 'email';

          // For Google OAuth: detect new user by checking if created_at is very recent (within 30 seconds)
          // This is only used for Google since email signups are tracked directly in signUp()
          if (method === 'google') {
            const createdAt = new Date(newUser.created_at);
            const now = new Date();
            const isNewGoogleUser = (now.getTime() - createdAt.getTime()) < 30000; // 30 seconds for OAuth flow

            if (isNewGoogleUser) {
              track('user_signed_up', { method: 'google' });
            } else {
              track('user_logged_in', { method: 'google' });
            }
          } else {
            // For email users, only track login here (signup is tracked in signUp())
            // But we need to check if this is an email confirmation callback
            const emailConfirmedKey = `${EMAIL_CONFIRMED_KEY}_${newUser.id}`;
            const wasEmailConfirmed = localStorage.getItem(emailConfirmedKey);

            if (!wasEmailConfirmed && newUser.email_confirmed_at) {
              // First time seeing this user with confirmed email - track confirmation
              track('email_confirmed', { method: 'email' });
              localStorage.setItem(emailConfirmedKey, 'true');
            }

            track('user_logged_in', { method: 'email' });
          }

          pendingAuthMethod.current = null;
        } else if (!isNowLoggedIn && wasLoggedIn) {
          // User logged out
          track('user_logged_out', {});
          reset();
        }

        previousUserIdRef.current = newUser?.id ?? null;
      }

      setUser(prevUser => {
        // Only update if user ID actually changed to prevent unnecessary re-renders
        // This prevents flicker when token refreshes on tab focus
        if (prevUser?.id === newUser?.id) {
          return prevUser;
        }
        return newUser;
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    pendingAuthMethod.current = 'email';
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      pendingAuthMethod.current = null;
      throw error;
    }

    // Track signup immediately when the API call succeeds
    // This fires before email confirmation, which is what we want
    if (data.user) {
      track('user_signed_up', { method: 'email' });
    }
  };

  const signIn = async (email: string, password: string) => {
    pendingAuthMethod.current = 'email';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      pendingAuthMethod.current = null;
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    pendingAuthMethod.current = 'google';
    // Use current origin to ensure redirect works in both dev and production
    // IMPORTANT: Also configure in Supabase Dashboard:
    // 1. Go to Authentication → URL Configuration
    // 2. Set "Site URL" to your production domain (e.g., https://yourdomain.com)
    // 3. Add your production domain to "Redirect URLs" whitelist
    const redirectTo = window.location.origin;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo,
      },
    });
    if (error) {
      pendingAuthMethod.current = null;
      throw error;
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
