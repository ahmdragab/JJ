import { useState, useEffect, useRef } from 'react';
import { ArrowUp, FolderOpen, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
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

  // Word slider for "designs"
  const words = ['designs', 'assets', 'ads', 'creatives', 'infographics', 'illustrations', 'posters'];
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const wordRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentWordIndex((prevIndex) => (prevIndex + 1) % words.length);
    }, 2000); // Change word every 2 seconds

    return () => clearInterval(interval);
  }, [words.length]);

  useEffect(() => {
    // Small delay to ensure the word is rendered before measuring
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
      // Close modal after successful auth - the useEffect will handle starting extraction if there's a pending URL
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
      // Save pending URL before redirecting
      if (url.trim()) {
        localStorage.setItem('pendingUrl', url.trim());
      }
      await signInWithGoogle();
      // Note: User will be redirected to Google, then back to the app
      // The auth state change will be handled automatically
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
      setLoading(false);
    }
  };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      // Save the URL so we can start extraction after signup
      if (url.trim()) {
        setPendingUrl(url.trim());
      }
      setIsSignUp(true);
      setShowAuth(true);
      setError('');
      return;
    }
    if (url.trim()) {
      onStart(url.trim());
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden">
      {/* Background video - cropped from bottom to hide trademark */}
      <div className="absolute inset-0 overflow-hidden">
        <video
          autoPlay
          muted
          playsInline
          className="absolute w-full h-full"
          style={{ 
            objectFit: 'cover',
            objectPosition: 'center top',
            height: '105%',
            top: '0',
            left: '0'
          }}
        >
          <source src={backgroundVideo} type="video/mp4" />
        </video>
      </div>

      {/* Overlay for better text readability */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"></div>

      {/* Centered content */}
      <div className="relative z-10 w-full max-w-md px-6 text-center -mt-16">
        {/* Subheading */}
        <p className="text-xl md:text-2xl text-white/90 mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>
          <span style={{ whiteSpace: 'nowrap', display: 'inline-block' }}>
            Create <span className="font-bold">on-brand</span>{' '}
            <span 
              className="inline-block relative" 
              style={{ 
                width: containerWidth || 'auto',
                minHeight: '1.5em',
                verticalAlign: 'baseline',
                transition: 'width 0.4s ease-in-out'
              }}
            >
              {words.map((word, index) => (
                <span
                  key={word}
                  ref={index === currentWordIndex ? wordRef : null}
                  className={`inline-block ${
                    index === currentWordIndex ? 'opacity-100 animate-fade-in' : 'opacity-0 absolute'
                  }`}
                  style={{ 
                    transition: 'opacity 0.4s ease-in-out',
                    whiteSpace: 'nowrap',
                    left: index === currentWordIndex ? 'auto' : 0
                  }}
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
          <div className="flex gap-2 bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/60 p-1.5">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="yourwebsite.com"
              className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none text-slate-800 placeholder:text-slate-400"
              style={{ fontFamily: "'Inter', sans-serif" }}
              required
            />
            <button
              type="submit"
              className="px-4 py-2.5 text-white font-medium rounded-lg transition-all flex items-center justify-center min-w-[45px] hover:opacity-90 bg-indigo-500 hover:bg-indigo-600"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>

        </form>
      </div>

      {/* Minimal header - top right */}
      <div className="absolute top-6 right-6 z-20 flex items-center gap-3">
        {user ? (
          <>
            {onViewBrands && (
              <button
                onClick={onViewBrands}
                className="flex items-center gap-2 text-sm text-slate-700 hover:text-slate-900 transition-colors bg-white/80 backdrop-blur-sm px-4 py-2 rounded-lg"
              >
                <FolderOpen className="w-4 h-4" />
                My Brands
              </button>
            )}
            <button
              onClick={signOut}
              className="text-sm text-slate-700 hover:text-slate-900 transition-colors bg-white/80 backdrop-blur-sm px-4 py-2 rounded-lg"
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
            className="text-sm text-slate-700 hover:text-slate-900 transition-colors bg-white/80 backdrop-blur-sm px-4 py-2 rounded-lg"
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
          {/* Backdrop with blur */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          
          {/* Modal */}
          <div 
            className="relative bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl max-w-md w-full p-8 border border-slate-200/50"
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
              className="absolute top-4 right-4 w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Title */}
            <h2 className="text-2xl font-bold text-slate-900 mb-6 pr-8">
              {isSignUp ? 'Create Account' : 'Sign In'}
            </h2>

            <form onSubmit={handleAuth} className="space-y-5">
              {/* Google Sign-In Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full py-3.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg border border-slate-200 flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                {loading ? 'Please wait...' : 'Continue with Google'}
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-slate-500">Or continue with email</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white"
                  required
                />
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg border border-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
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
                className="text-sm text-slate-600 hover:text-indigo-600 transition-colors"
              >
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                <span className="font-medium text-indigo-600 hover:text-indigo-700">
                  {isSignUp ? 'Sign in' : 'Sign up'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fadeIn 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}
