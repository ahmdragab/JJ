import { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import * as Sentry from '@sentry/react';
import { supabase } from '../lib/supabase';

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
      } else {
        Sentry.setUser(null);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
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
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signInWithGoogle = async () => {
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
    if (error) throw error;
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
