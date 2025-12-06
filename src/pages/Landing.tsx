import { useState, useEffect, useRef } from 'react';
import { ArrowUp, FolderOpen, X, Mail, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import backgroundVideo from '../video.mp4';

export function Landing({ 
  onStart, 
  onViewBrands 
}: { 
  onStart: (url: string) => void;
  onViewBrands?: () => void;
}) {
  const { user, signIn, signUp, signOut } = useAuth();
  const [url, setUrl] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);

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


  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setShowEmailConfirmation(false);

    try {
      if (isSignUp) {
        await signUp(email, password);
        // Show email confirmation message instead of closing modal
        setShowEmailConfirmation(true);
      } else {
        await signIn(email, password);
        setShowAuth(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
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
              className="px-4 py-2.5 text-white font-medium rounded-lg transition-all flex items-center justify-center min-w-[45px] hover:opacity-90 bg-emerald-500 hover:bg-emerald-600"
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
                setShowEmailConfirmation(false);
                setEmail('');
                setPassword('');
              }}
              className="absolute top-4 right-4 w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Email Confirmation Message */}
            {showEmailConfirmation ? (
              <div className="text-center py-4">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                    <Mail className="w-8 h-8 text-emerald-600" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-3">
                  Check your email
                </h2>
                <p className="text-slate-600 mb-2">
                  We've sent a confirmation link to
                </p>
                <p className="text-slate-900 font-medium mb-6">{email}</p>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <div className="text-left">
                      <p className="text-sm text-emerald-900 font-medium mb-1">
                        Next steps
                      </p>
                      <p className="text-sm text-emerald-700">
                        Click the confirmation link in the email to verify your account and start creating.
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowAuth(false);
                    setShowEmailConfirmation(false);
                    setEmail('');
                    setPassword('');
                  }}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl"
                >
                  Got it
                </button>
              </div>
            ) : (
              <>
                {/* Title */}
                <h2 className="text-2xl font-bold text-slate-900 mb-6 pr-8">
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </h2>

                <form onSubmit={handleAuth} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all bg-white"
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
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all bg-white"
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
                className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
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
                    className="text-sm text-slate-600 hover:text-emerald-600 transition-colors"
                  >
                    {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                    <span className="font-medium text-emerald-600 hover:text-emerald-700">
                      {isSignUp ? 'Sign in' : 'Sign up'}
                    </span>
                  </button>
                </div>
              </>
            )}
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
