import { useState, useEffect, useRef } from 'react';
import { ArrowUp, FolderOpen, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isValidDomain } from '../lib/supabase';
import backgroundVideo from '../video.mp4';

export function Landing({
  onStart,
  onViewBrands
}: {
  onStart: (url: string) => void;
  onViewBrands?: () => void;
}) {
  const { user, signIn, signUp, signInWithGoogle, signOut } = useAuth();
  const [url, setUrl] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [domainError, setDomainError] = useState('');

  // Word slider for "designs"
  const words = ['designs', 'assets', 'ads', 'creatives', 'infographics', 'illustrations', 'posters'];
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const wordRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentWordIndex((prevIndex) => (prevIndex + 1) % words.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [words.length]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (wordRef.current) {
        const width = wordRef.current.offsetWidth;
        setContainerWidth(width);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [currentWordIndex]);

  // Auto-start extraction when user logs in with a pending URL
  useEffect(() => {
    if (user && pendingUrl) {
      onStart(pendingUrl);
      setPendingUrl(null);
      setUrl('');
    }
  }, [user, pendingUrl, onStart]);

  // Check for pending URL from localStorage (for OAuth redirects)
  useEffect(() => {
    if (user) {
      const storedPendingUrl = localStorage.getItem('pendingUrl');
      if (storedPendingUrl) {
        localStorage.removeItem('pendingUrl');
        onStart(storedPendingUrl);
        setUrl('');
      }
    }
  }, [user, onStart]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      setShowAuth(false);
      setEmail('');
      setPassword('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      if (url.trim()) {
        localStorage.setItem('pendingUrl', url.trim());
      }
      await signInWithGoogle();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
      setLoading(false);
    }
  };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    setDomainError('');

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setDomainError('Please enter a domain name');
      return;
    }

    if (!isValidDomain(trimmedUrl)) {
      setDomainError('Please enter a valid domain name (e.g., example.com)');
      return;
    }

    if (!user) {
      setPendingUrl(trimmedUrl);
      setIsSignUp(true);
      setShowAuth(true);
      setError('');
      return;
    }

    onStart(trimmedUrl);
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden">
      {/* Background video */}
      <div className="absolute inset-0 overflow-hidden">
        <video
          autoPlay
          muted
          playsInline
          className="absolute w-full object-cover object-center-top"
          style={{ height: '105%', top: 0, left: 0 }}
        >
          <source src={backgroundVideo} type="video/mp4" />
        </video>
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]" />

      {/* Centered content */}
      <div className="relative z-10 w-full max-w-md px-4 sm:px-6 text-center -mt-12 sm:-mt-16">
        {/* Tagline */}
        <p className="font-display text-lg sm:text-xl md:text-2xl text-white/90 mb-4 sm:mb-6">
          <span className="whitespace-nowrap inline-block">
            Create <span className="font-bold">on-brand</span>{' '}
            <span
              className="inline-block relative transition-[width] duration-400 ease-in-out"
              style={{
                width: containerWidth || 'auto',
                minHeight: '1.5em',
                verticalAlign: 'baseline',
              }}
            >
              {words.map((word, index) => (
                <span
                  key={word}
                  ref={index === currentWordIndex ? wordRef : null}
                  className={`inline-block transition-opacity duration-400 ${
                    index === currentWordIndex
                      ? 'opacity-100 animate-fade-in-up'
                      : 'opacity-0 absolute left-0'
                  }`}
                >
                  {word}
                </span>
              ))}
            </span>
            {' '}using AI
          </span>
          <br />in seconds.
        </p>

        {/* Input box */}
        <form onSubmit={handleStart} className="w-full">
          <div className="flex flex-col gap-2">
            <div className="flex gap-1.5 sm:gap-2 glass rounded-xl shadow-2xl p-1 sm:p-1.5">
              <input
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setDomainError('');
                }}
                placeholder="yourwebsite.com"
                className="flex-1 px-2 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm bg-transparent outline-none text-neutral-800 placeholder:text-neutral-400 font-body"
                required
              />
              <button
                type="submit"
                className="btn-primary px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg min-w-[40px] sm:min-w-[45px] shrink-0"
              >
                <ArrowUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
            {domainError && (
              <p className="text-sm text-red-200 bg-red-500/20 px-3 py-2 rounded-lg backdrop-blur-sm">
                {domainError}
              </p>
            )}
          </div>
        </form>
      </div>

      {/* Header buttons - top right */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 flex items-center gap-2 sm:gap-3">
        {user ? (
          <>
            {onViewBrands && (
              <button
                onClick={onViewBrands}
                className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-neutral-700 hover:text-neutral-900 transition-colors glass-muted px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg touch-manipulation active:scale-[0.98]"
              >
                <FolderOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">My Brands</span>
                <span className="sm:hidden">Brands</span>
              </button>
            )}
            <button
              onClick={signOut}
              className="text-xs sm:text-sm text-neutral-700 hover:text-neutral-900 transition-colors glass-muted px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg touch-manipulation active:scale-[0.98]"
            >
              Sign Out
            </button>
          </>
        ) : (
          <button
            onClick={() => {
              setIsSignUp(false);
              setShowAuth(true);
              setError('');
            }}
            className="text-xs sm:text-sm text-neutral-700 hover:text-neutral-900 transition-colors glass-muted px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg touch-manipulation active:scale-[0.98]"
          >
            Sign In
          </button>
        )}
      </div>

      {/* Auth Modal */}
      {showAuth && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowAuth(false);
            setError('');
            setPendingUrl(null);
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm modal-backdrop-enter" />

          {/* Modal */}
          <div
            className="relative glass rounded-2xl shadow-2xl max-w-md w-full p-4 sm:p-6 md:p-8 max-h-[90vh] overflow-y-auto modal-content-enter"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => {
                setShowAuth(false);
                setError('');
                setEmail('');
                setPassword('');
                setPendingUrl(null);
              }}
              className="absolute top-4 right-4 w-8 h-8 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Title */}
            <h2 className="text-2xl font-bold text-neutral-800 mb-6 pr-8 font-heading">
              {isSignUp ? 'Create Account' : 'Sign In'}
            </h2>

            <form onSubmit={handleAuth} className="space-y-5">
              {/* Google Sign-In Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full py-3.5 bg-white hover:bg-neutral-50 text-neutral-700 font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg border border-neutral-200 flex items-center justify-center gap-3 touch-manipulation active:scale-[0.98]"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {loading ? 'Please wait...' : 'Continue with Google'}
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-neutral-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-neutral-500">Or continue with email</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  required
                />
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3.5 rounded-xl shadow-lg hover:shadow-xl"
              >
                {loading ? 'Please wait...' : isSignUp ? 'Sign Up' : 'Sign In'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError('');
                }}
                className="text-sm text-neutral-600 hover:text-brand-primary transition-colors"
              >
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                <span className="font-medium text-brand-primary hover:text-brand-primary-hover">
                  {isSignUp ? 'Sign in' : 'Sign up'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
