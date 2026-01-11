import { useState, useEffect, useRef } from 'react';
import { ArrowRight, Globe, Check, X, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isValidDomain, supabase } from '../lib/supabase';

// Contact email - single source of truth
const SUPPORT_EMAIL = 'support@alwan.io';

// Example gallery images (served from public/examples/)
const galleryImages = [
  '/examples/tabby.png',
  '/examples/deel-1.png',
  '/examples/lattice.png',
  '/examples/deel-2.png',
  '/examples/rippling-1.png',
  '/examples/lattice-2.png',
  '/examples/deel-3.png',
  '/examples/download-1.png',
  '/examples/download-2.png',
  '/examples/download-3.png',
];

// ============================================================================
// SHARED TYPES & HOOKS
// ============================================================================

interface LandingV2Props {
  onStart: (url: string) => void;
  onViewBrands?: () => void;
}

// ============================================================================
// FAQ SECTION COMPONENT
// ============================================================================

interface FAQItem {
  question: string;
  answer: string;
}

const faqData: FAQItem[] = [
  {
    question: 'How does brand extraction work?',
    answer: 'Simply paste your website URL and our AI analyzes your site to extract your brand colors, fonts, logos, and brand voice. We use advanced machine learning to identify your visual identity and create a comprehensive brand kit that ensures all generated ads stay perfectly on-brand.'
  },
  {
    question: 'What AI models power the image generation?',
    answer: 'We use a combination of the latest reasoning and generative AI models to produce stunning, photorealistic visuals and craft compelling ad copy that resonates with your audience.'
  },
  {
    question: 'How do credits work?',
    answer: 'Credits are simple: 1 credit = 1 image generation. When you generate an ad, one credit is deducted from your balance. Free accounts start with 5 credits, and paid plans include monthly credit allowances. Unused credits roll over to the next month on paid plans.'
  },
  {
    question: 'Can I edit generated images?',
    answer: 'Yes! Every generated image can be refined through our conversational editing feature. Simply describe the changes you want - adjust colors, swap elements, change text, or modify layouts - and our AI will apply your edits while maintaining brand consistency.'
  },
  {
    question: 'What file formats are supported?',
    answer: 'Generated images are delivered in high-resolution PNG format, optimized for digital advertising. We support all major ad platform dimensions including Instagram (1080x1080, 1080x1920), Facebook, LinkedIn, Twitter, and custom sizes for any platform you need.'
  },
  {
    question: 'Is my brand data secure?',
    answer: 'Absolutely. Your brand data is encrypted at rest and in transit. We never share your brand assets or generated content with third parties. All data is stored securely on enterprise-grade infrastructure with SOC 2 compliant practices.'
  }
];

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="px-6 sm:px-8 lg:px-16 py-20 lg:py-28 bg-white">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4 font-dm"
              >
            Frequently asked questions
          </h2>
          <p className="text-gray-500 text-lg font-dm"
             >
            Everything you need to know about Alwan
          </p>
        </div>

        {/* FAQ Accordion */}
        <div className="space-y-3">
          {faqData.map((faq, index) => (
            <div
              key={index}
              className={`rounded-2xl border transition-all duration-300 ${
                openIndex === index
                  ? 'border-[#3531B7]/20 bg-[#3531B7]/[0.02] shadow-lg shadow-[#3531B7]/5'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <button
                onClick={() => toggleFAQ(index)}
                className="w-full px-6 py-5 flex items-center justify-between text-left"
              >
                <span
                  className={`text-base sm:text-lg font-semibold transition-colors font-dm ${
                    openIndex === index ? 'text-[#3531B7]' : 'text-gray-900'
                  }`}
                >
                  {faq.question}
                </span>
                <div
                  className={`ml-4 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                    openIndex === index
                      ? 'bg-[#3531B7] rotate-180'
                      : 'bg-gray-100'
                  }`}
                >
                  <ChevronDown
                    className={`w-5 h-5 transition-colors ${
                      openIndex === index ? 'text-white' : 'text-gray-500'
                    }`}
                  />
                </div>
              </button>

              {/* Answer with smooth height animation */}
              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  openIndex === index ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="px-6 pb-5">
                  <p
                    className="text-gray-600 leading-relaxed font-dm"
                    
                  >
                    {faq.answer}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Contact CTA */}
        <div className="mt-10 text-center">
          <p className="text-gray-500 font-dm" >
            Still have questions?{' '}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-[#3531B7] hover:underline font-medium"
            >
              Get in touch
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// VERSION B: ALWAN - CONVERSION FOCUSED
// Clean, professional, trust-building with clear value proposition
// ============================================================================

interface Plan {
  id: string;
  name: string;
  display_name: string;
  description: string;
  price_monthly: number;
  price_yearly: number | null;
  credits_per_month: number;
  sort_order: number;
  features: {
    priority_support?: boolean;
    usage_analytics?: boolean;
  };
}

function VersionB({ onStart }: { onStart: (url: string) => void }) {
  const { user, signIn, signUp, signInWithGoogle } = useAuth();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [activeStep, setActiveStep] = useState(0);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [plansLoading, setPlansLoading] = useState(true);
  const [sectionInView, setSectionInView] = useState(false);
  const howItWorksSectionRef = useRef<HTMLElement>(null);

  // Auth modal state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Intersection Observer to detect when "How it works" section is in view
  useEffect(() => {
    const section = howItWorksSectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSectionInView(true);
          setActiveStep(0); // Reset to step 0 when section comes into view
        } else {
          setSectionInView(false);
        }
      },
      { threshold: 0.3 } // Trigger when 30% of section is visible
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // Auto-rotate through steps only when section is in view
  useEffect(() => {
    if (!sectionInView) return;

    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 3);
    }, 5000); // 5s to match animation duration
    return () => clearInterval(interval);
  }, [sectionInView]);

  // Load plans from Supabase
  useEffect(() => {
    async function loadPlans() {
      try {
        const { data, error } = await supabase
          .from('plans')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (!error && data) {
          setPlans(data);
        }
      } catch (err) {
        console.error('Error loading plans:', err);
      } finally {
        setPlansLoading(false);
      }
    }
    loadPlans();
  }, []);

  // Recover pending URL after OAuth redirect
  useEffect(() => {
    if (user) {
      const storedPendingUrl = localStorage.getItem('pendingUrl');
      if (storedPendingUrl) {
        localStorage.removeItem('pendingUrl');
        // Security: Validate before using - localStorage could have been tampered with
        // Check for dangerous protocols (javascript:, data:, etc.)
        const hasProtocol = storedPendingUrl.includes(':');
        const isSafeProtocol = storedPendingUrl.startsWith('http://') || storedPendingUrl.startsWith('https://');
        if (hasProtocol && !isSafeProtocol) {
          console.warn('Blocked unsafe protocol in pendingUrl:', storedPendingUrl.split(':')[0]);
          return;
        }
        if (isValidDomain(storedPendingUrl)) {
          onStart(storedPendingUrl);
        }
      }
    }
  }, [user, onStart]);

  // Email/password auth handler
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      // On success, the user state will update and useEffect will handle pending URL
      setShowAuthModal(false);
      setEmail('');
      setPassword('');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
      setAuthError(errorMessage);
    } finally {
      setAuthLoading(false);
    }
  };

  // Google sign-in handler (stores pending URL for OAuth redirect)
  const handleGoogleSignIn = async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      if (url.trim()) {
        localStorage.setItem('pendingUrl', url.trim());
      }
      await signInWithGoogle();
      // Note: signInWithGoogle redirects, so we won't reach here on success
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Google sign-in failed');
      setAuthLoading(false);
    }
  };

  // Open auth modal
  const openAuthModal = (signUpMode = false) => {
    setIsSignUp(signUpMode);
    setAuthError('');
    setEmail('');
    setPassword('');
    setShowAuthModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!url.trim()) {
      setError('Enter your website URL');
      return;
    }

    if (!isValidDomain(url.trim())) {
      setError('Please enter a valid domain');
      return;
    }

    if (!user) {
      localStorage.setItem('pendingUrl', url.trim());
      openAuthModal(true); // Open sign up modal
      return;
    }

    onStart(url.trim());
  };

  // How it works steps with icons and mock visuals
  const steps = [
    {
      num: '01',
      title: 'Paste your URL',
      desc: 'Just drop your website link — we handle the rest',
      icon: '🔗',
      visual: 'url-input'
    },
    {
      num: '02',
      title: 'Brand extracted',
      desc: 'Colors, fonts, logos, and voice — captured automatically',
      icon: '🎨',
      visual: 'brand-extract'
    },
    {
      num: '03',
      title: 'Ads generated',
      desc: 'Scroll-stopping creatives for every platform',
      icon: '✨',
      visual: 'ads-generated'
    },
  ];


  return (
    <div className="relative overflow-hidden bg-white">
      {/* Subtle gradient background */}
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full opacity-[0.03] blur-[100px]"
             style={{ background: 'radial-gradient(circle, #3531B7 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full opacity-[0.02] blur-[80px]"
             style={{ background: 'radial-gradient(circle, #3531B7 0%, transparent 70%)' }} />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Navigation */}
        <header className="w-full px-6 sm:px-8 lg:px-16 py-5 flex justify-between items-center relative">
          {/* Left: Logo */}
          <div className="flex items-center">
            <img src="/logo-full.png" alt="Alwan" style={{ width: 100, height: 'auto' }} />
          </div>

          {/* Center: Nav links */}
          <nav className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
            <a href="#how-it-works" className="px-4 py-2 text-base font-medium text-gray-600 hover:text-gray-900 transition-colors font-dm"
               >
              How it works
            </a>
            <a href="#gallery" className="px-4 py-2 text-base font-medium text-gray-600 hover:text-gray-900 transition-colors font-dm"
               >
              Gallery
            </a>
            <a href="#pricing" className="px-4 py-2 text-base font-medium text-gray-600 hover:text-gray-900 transition-colors font-dm"
               >
              Pricing
            </a>
          </nav>

          {/* Right: Auth buttons */}
          <div className="flex items-center gap-3">
            {user ? (
              <button
                onClick={() => window.location.href = '/brands'}
                className="px-5 py-2.5 rounded-full text-sm font-medium transition-all hover:opacity-90 bg-gray-900 text-white font-dm"
                
              >
                Dashboard
              </button>
            ) : (
              <>
                <button
                  onClick={() => openAuthModal(false)}
                  className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors hidden sm:block font-dm"
                  
                >
                  Sign In
                </button>
                <button
                  onClick={() => openAuthModal(true)}
                  className="px-5 py-2.5 rounded-full text-sm font-medium transition-all hover:opacity-90 text-white font-dm bg-brand-primary"
                >
                  Get Started Free
                </button>
              </>
            )}
          </div>
        </header>

        {/* Hero Section */}
        <section className="px-6 sm:px-8 lg:px-16 py-8 lg:py-12">
          <div className="max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              {/* Left: Text content */}
              <div className="max-w-xl">
                {/* Headline */}
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] mb-5 text-gray-900 font-dm"
                    >
                  Your brand.
                  <br />
                  <span style={{ color: '#3531B7' }}>Infinite ads.</span>
                </h1>

                {/* Subheadline */}
                <p className="text-lg text-gray-500 mb-8 leading-relaxed font-dm"
                   >
                  Drop your website URL. We extract your brand and generate scroll-stopping ads for all platforms. No design skills. No waiting.
                  <span className="text-gray-900 font-medium"> Just results in 30 seconds.</span>
                </p>

                {/* URL Input */}
                <form onSubmit={handleSubmit} className="mb-6">
                  <div className={`flex flex-col sm:flex-row gap-2 p-1.5 rounded-2xl bg-gray-50 border-2 transition-all ${
                    error ? 'border-red-300' : 'border-gray-100 focus-within:border-gray-200'
                  }`}>
                    <div className="flex-1 flex items-center gap-3 px-4">
                      <Globe className="w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={url}
                        onChange={(e) => { setUrl(e.target.value); setError(''); }}
                        placeholder="Enter your website URL"
                        className="flex-1 bg-transparent outline-none py-3.5 text-gray-900 placeholder:text-gray-400 font-dm"
                        
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-6 py-3.5 rounded-xl text-white font-semibold transition-all hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-2 whitespace-nowrap font-dm bg-brand-primary"
                    >
                      Generate Ads
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                  {error && (
                    <p className="text-red-500 text-sm mt-2 font-dm" >{error}</p>
                  )}
                </form>

                {/* Trust indicators */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-400 font-dm" >
                  <div className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>Free to start</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>No credit card</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>Results in 30 sec</span>
                  </div>
                </div>

                {/* Customer logos / social proof */}
                <div className="mt-10 pt-8 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-4 uppercase tracking-wider font-dm" >
                    Trusted by teams at
                  </p>
                  <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                    {['Noon', 'Careem', 'Talabat', 'Kitopi', 'Tabby'].map((company) => (
                      <span
                        key={company}
                        className="text-lg font-semibold text-gray-300 font-dm"
                        
                      >
                        {company}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: 2x2 grid of example ads */}
              <div className="hidden lg:grid grid-cols-2 gap-4 w-full max-w-md">
                {['/examples/lattice.png', '/examples/noon.png', '/examples/tabby.png', '/examples/deel-2.png'].map((img, index) => (
                  <div
                    key={index}
                    className="hero-grid-card group rounded-2xl overflow-hidden shadow-lg aspect-[4/5] bg-gray-200 animate-pulse"
                  >
                    <img
                      src={img}
                      alt={`Ad example ${index + 1}`}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                      onLoad={(e) => {
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          parent.classList.remove('bg-gray-200', 'animate-pulse');
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* How it works - Dynamic Animated Section */}
        <section id="how-it-works" ref={howItWorksSectionRef} className="px-6 sm:px-8 lg:px-16 py-20 lg:py-28 bg-gray-50">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4 font-dm"
                  >
                From URL to ads in 3 steps
              </h2>
              <p className="text-gray-500 text-lg max-w-2xl mx-auto font-dm"
                 >
                No design skills needed. No brand guidelines required. Just your website.
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Left: Step selector */}
              <div className="space-y-4">
                {steps.map((step, index) => (
                  <button
                    key={step.num}
                    onClick={() => setActiveStep(index)}
                    className={`w-full text-left p-6 rounded-2xl transition-all duration-500 ${
                      activeStep === index
                        ? 'bg-white shadow-xl shadow-gray-200/50 scale-[1.02]'
                        : 'bg-transparent hover:bg-white/50'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-all duration-500 ${
                        activeStep === index ? 'bg-[#3531B7] scale-110' : 'bg-gray-100'
                      }`}>
                        {activeStep === index ? (
                          <span className="text-white text-lg">{step.icon}</span>
                        ) : (
                          <span className="text-gray-400 text-sm font-bold">{step.num}</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className={`text-lg font-semibold mb-1 transition-colors font-dm ${
                          activeStep === index ? 'text-gray-900' : 'text-gray-500'
                        }`}>
                          {step.title}
                        </h3>
                        <p className={`text-sm transition-colors font-dm ${
                          activeStep === index ? 'text-gray-600' : 'text-gray-400'
                        }`}>
                          {step.desc}
                        </p>
                      </div>
                      {activeStep === index && (
                        <div className="w-2 h-2 rounded-full bg-[#3531B7] animate-pulse" />
                      )}
                    </div>

                    {/* Progress bar for active step */}
                    {activeStep === index && (
                      <div className="mt-4 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#3531B7] rounded-full animate-progress"
                          style={{ animation: 'progress 5s linear' }}
                        />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* Right: Visual showcase */}
              <div className="relative h-[400px] lg:h-[450px] rounded-3xl overflow-hidden bg-white shadow-2xl shadow-gray-200/50">
                {/* Step 1: URL Input visual - key forces remount to restart animations */}
                <div
                  key={sectionInView && activeStep === 0 ? 'step1-active' : 'step1-inactive'}
                  className={`absolute inset-0 p-8 transition-all duration-700 ${
                    activeStep === 0 ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8 pointer-events-none'
                  }`}>
                  <div className="h-full flex flex-col items-center justify-center">
                    <div className="w-full max-w-md">
                      {/* Browser mockup */}
                      <div className="bg-gray-100 rounded-xl p-1">
                        <div className="flex items-center gap-2 px-3 py-2">
                          <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-red-400" />
                            <div className="w-3 h-3 rounded-full bg-yellow-400" />
                            <div className="w-3 h-3 rounded-full bg-green-400" />
                          </div>
                          <div className="flex-1 bg-white rounded-lg px-4 py-2 text-sm text-gray-600 flex items-center gap-2">
                            <Globe className="w-4 h-4 text-gray-400" />
                            <span className="animate-paste">
                              noon.com
                            </span>
                          </div>
                          {/* Go button with glow effect */}
                          <button className="px-3 py-2 bg-[#3531B7] text-white text-xs font-semibold rounded-lg animate-button-glow relative overflow-hidden">
                            Go
                            <div className="absolute inset-0 bg-white/30 animate-button-shine rounded-lg" />
                          </button>
                        </div>
                        <div className="bg-white rounded-lg m-1 p-6 h-48 flex items-center justify-center">
                          <div className="text-center">
                            <img src="/noon/noon.svg" alt="noon" className="h-12 mx-auto mb-4" />
                            <div className="h-3 w-32 bg-gray-200 rounded mx-auto mb-2" />
                            <div className="h-2 w-24 bg-gray-100 rounded mx-auto" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 2: Brand extraction visual - noon.com */}
                <div className={`absolute inset-0 p-8 transition-all duration-700 ${
                  activeStep === 1 ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8 pointer-events-none'
                }`}>
                  <div className="h-full flex flex-col items-center justify-center">
                    <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                      {/* Colors - noon brand colors */}
                      <div className="bg-gray-50 rounded-xl p-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                        <div className="text-xs text-gray-400 mb-2 font-medium">Colors</div>
                        <div className="flex gap-2">
                          <div className="w-8 h-8 rounded-lg animate-scale-in" style={{ backgroundColor: '#FEEE00', animationDelay: '0.2s' }} />
                          <div className="w-8 h-8 rounded-lg animate-scale-in" style={{ backgroundColor: '#404553', animationDelay: '0.3s' }} />
                          <div className="w-8 h-8 rounded-lg bg-white border animate-scale-in" style={{ animationDelay: '0.4s' }} />
                        </div>
                      </div>
                      {/* Fonts */}
                      <div className="bg-gray-50 rounded-xl p-4 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                        <div className="text-xs text-gray-400 mb-2 font-medium">Fonts</div>
                        <div className="text-lg font-bold text-gray-900">Aa</div>
                        <div className="text-xs text-gray-500">Noto Sans</div>
                      </div>
                      {/* Logo - noon */}
                      <div className="bg-gray-50 rounded-xl p-4 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                        <div className="text-xs text-gray-400 mb-2 font-medium">Logo</div>
                        <img src="/noon/noon.svg" alt="noon" className="h-8" />
                      </div>
                      {/* Voice */}
                      <div className="bg-gray-50 rounded-xl p-4 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
                        <div className="text-xs text-gray-400 mb-2 font-medium">Voice</div>
                        <div className="flex flex-wrap gap-1">
                          <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: '#FEEE00', color: '#404553' }}>Bold</span>
                          <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: '#FEEE00', color: '#404553' }}>Friendly</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 3: Generated ads visual - noon.com ads */}
                <div className={`absolute inset-0 flex items-center justify-center p-4 transition-all duration-700 ${
                  activeStep === 2 ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8 pointer-events-none'
                }`}>
                  <div className="flex gap-2 w-full h-full items-center justify-center">
                    <img src="/noon/noon-5.png" alt="noon ad 1" className="flex-1 min-w-0 h-auto max-h-full object-contain rounded-xl shadow-lg" />
                    <img src="/noon/noon-6.png" alt="noon ad 2" className="flex-1 min-w-0 h-auto max-h-full object-contain rounded-xl shadow-lg" />
                    <img src="/noon/noon-7.png" alt="noon ad 3" className="flex-1 min-w-0 h-auto max-h-full object-contain rounded-xl shadow-lg" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Gallery - Ads created using Alwan */}
        <section id="gallery" className="py-16 lg:py-20 bg-white overflow-hidden">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 font-dm" >
              Ads created using Alwan
            </h2>
            <p className="text-gray-400 text-sm font-dm" >
              Real examples from real brands
            </p>
          </div>

          {/* Scrolling gallery with micro-interactions */}
          <div className="relative">
            {/* Gradient fade edges */}
            <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />

            {/* Scrolling container */}
            <div className="flex items-start gap-5 animate-gallery-scroll hover:[animation-play-state:paused]">
              {/* Double the images for seamless loop */}
              {[...galleryImages, ...galleryImages].map((img, index) => (
                <div
                  key={index}
                  className="gallery-card flex-shrink-0 w-56 sm:w-64 lg:w-72 aspect-[4/5] rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer group bg-gray-200 animate-pulse"
                >
                  <img
                    src={img}
                    alt={`Ad example ${(index % galleryImages.length) + 1}`}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    onLoad={(e) => {
                      // Remove skeleton styles once image loads
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        parent.classList.remove('bg-gray-200', 'animate-pulse');
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="px-6 sm:px-8 lg:px-16 py-20 lg:py-28 bg-gray-50">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4 font-dm"
                  >
                Simple, transparent pricing
              </h2>
              <p className="text-gray-500 text-lg mb-8 font-dm"
                 >
                Start free. Upgrade when you need more.
              </p>

              {/* Billing Toggle */}
              <div className="flex items-center justify-center gap-4 mb-6">
                <span className={`text-sm font-medium transition-colors font-dm ${billingCycle === 'monthly' ? 'text-gray-900' : 'text-gray-400'}`}>
                  Monthly
                </span>
                <button
                  onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    billingCycle === 'yearly' ? 'bg-[#3531B7]' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                      billingCycle === 'yearly' ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className={`text-sm font-medium transition-colors flex items-center gap-2 font-dm ${billingCycle === 'yearly' ? 'text-gray-900' : 'text-gray-400'}`}>
                  Annual
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                    Save 20%
                  </span>
                </span>
              </div>

              <div className="inline-flex items-center bg-[#3531B7]/10 text-[#3531B7] px-4 py-2 rounded-xl text-sm font-medium">
                <span>1 credit = 1 image generation</span>
              </div>
            </div>

            {/* Plans Grid */}
            {plansLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-[#3531B7] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                {plans.map((plan, index) => {
                  const isRecommended = plan.name === 'plus';
                  const price = billingCycle === 'yearly' && plan.price_yearly
                    ? plan.price_yearly
                    : plan.price_monthly;
                  const monthlyEquivalent = billingCycle === 'yearly' && plan.price_yearly
                    ? (plan.price_yearly / 12).toFixed(0)
                    : null;

                  return (
                    <div
                      key={plan.id}
                      className={`relative bg-white rounded-2xl p-6 transition-all duration-300 hover:shadow-xl ${
                        isRecommended
                          ? 'ring-2 ring-[#3531B7] shadow-lg shadow-[#3531B7]/10'
                          : 'shadow-md hover:shadow-lg'
                      }`}
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      {isRecommended && (
                        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                          <span className="bg-[#3531B7] text-white px-3 py-1 rounded-full text-xs font-semibold shadow-lg">
                            Most Popular
                          </span>
                        </div>
                      )}

                      <div className="mb-6">
                        <h3 className="text-xl font-bold text-gray-900 mb-1 font-dm" >
                          {plan.display_name}
                        </h3>
                        <p className="text-gray-500 text-sm font-dm" >
                          {plan.description}
                        </p>
                      </div>

                      <div className="mb-6">
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold text-gray-900">${price}</span>
                          <span className="text-gray-400 text-sm">
                            /{billingCycle === 'yearly' ? 'year' : 'mo'}
                          </span>
                        </div>
                        {monthlyEquivalent && (
                          <p className="text-xs text-gray-400 mt-1">
                            ${monthlyEquivalent}/month billed annually
                          </p>
                        )}
                      </div>

                      <div className="space-y-3 mb-6">
                        <div className="flex items-center gap-2 text-gray-700">
                          <div className="w-5 h-5 rounded-full bg-[#3531B7]/10 flex items-center justify-center">
                            <Check className="w-3 h-3 text-[#3531B7]" />
                          </div>
                          <span className="text-sm font-medium font-dm" >
                            {plan.credits_per_month} credits/month
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                            <Check className="w-3 h-3 text-gray-400" />
                          </div>
                          <span className="text-sm font-dm" >
                            All platforms
                          </span>
                        </div>
                        {plan.features.priority_support && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                              <Check className="w-3 h-3 text-gray-400" />
                            </div>
                            <span className="text-sm font-dm" >
                              Priority support
                            </span>
                          </div>
                        )}
                        {plan.features.usage_analytics && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                              <Check className="w-3 h-3 text-gray-400" />
                            </div>
                            <span className="text-sm font-dm" >
                              Usage analytics
                            </span>
                          </div>
                        )}
                      </div>

                      {plan.name === 'free' ? (
                        <button
                          onClick={() => openAuthModal(true)}
                          className="w-full py-3 px-4 rounded-xl font-semibold transition-all bg-gray-100 text-gray-700 hover:bg-gray-200 font-dm"
                          
                        >
                          Get Started
                        </button>
                      ) : (
                        <button
                          onClick={() => openAuthModal(true)}
                          className={`w-full py-3 px-4 rounded-xl font-semibold transition-all font-dm ${
                            isRecommended
                              ? 'bg-[#3531B7] text-white hover:opacity-90 shadow-lg shadow-[#3531B7]/25'
                              : 'bg-gray-900 text-white hover:bg-gray-800'
                          }`}
                        >
                          Subscribe
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Enterprise CTA */}
            <div className="mt-12 text-center">
              <p className="text-gray-500 font-dm" >
                Need more credits or custom solutions?{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#3531B7] hover:underline font-medium">
                  Contact us
                </a>
              </p>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <FAQSection />

        {/* Final CTA */}
        <section className="px-6 sm:px-8 lg:px-16 py-20 bg-gray-900">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 font-dm"
                >
              Ready to create your first ad?
            </h2>
            <p className="text-gray-400 text-lg mb-8 font-dm"
               >
              Join hundreds of businesses creating on-brand ads in seconds.
            </p>
            <button
              onClick={() => openAuthModal(true)}
              className="px-8 py-4 rounded-xl text-gray-900 font-semibold transition-all hover:opacity-90 bg-white text-lg font-dm"
              
            >
              Get Started Free
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 sm:px-8 lg:px-16 py-8 bg-gray-900 border-t border-gray-800">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <img src="/logo-full.png" alt="Alwan" className="h-7 w-auto object-contain" />
              <span className="text-sm text-gray-500 font-dm" >
                Alwan — AI-powered brand ads
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-500 font-dm" >
              <a href="#pricing" className="hover:text-gray-300 transition-colors">Pricing</a>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-gray-300 transition-colors">Contact</a>
            </div>
          </div>
        </footer>
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowAuthModal(false);
            setAuthError('');
            setAuthLoading(false);
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Modal */}
          <div
            className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8 font-dm"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => {
                setShowAuthModal(false);
                setAuthError('');
                setAuthLoading(false);
                setEmail('');
                setPassword('');
              }}
              className="absolute top-4 right-4 w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Title */}
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pr-8">
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </h2>

            <form onSubmit={handleAuth} className="space-y-4">
              {/* Google Sign-In Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={authLoading}
                className="w-full py-3.5 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all border border-gray-200 flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {authLoading ? 'Please wait...' : 'Continue with Google'}
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-white text-gray-500">Or continue with email</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#3531B7] focus:ring-2 focus:ring-[#3531B7]/20 outline-none transition-all text-gray-900 placeholder:text-gray-400"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#3531B7] focus:ring-2 focus:ring-[#3531B7]/20 outline-none transition-all text-gray-900 placeholder:text-gray-400"
                  placeholder="Enter your password"
                  required
                />
              </div>

              {authError && (
                <div className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-200">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3.5 rounded-xl text-white font-semibold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#3531B7' }}
              >
                {authLoading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setAuthError('');
                }}
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                <span className="font-medium" style={{ color: '#3531B7' }}>
                  {isSignUp ? 'Sign in' : 'Sign up'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fonts */}
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Animations */}
      <style>{`
        @keyframes progress {
          from { width: 0%; }
          to { width: 100%; }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.5s ease-out forwards;
          opacity: 0;
        }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-scale-in {
          animation: scale-in 0.4s ease-out forwards;
          opacity: 0;
        }
        @keyframes float-up {
          0%, 100% { transform: translateY(0) rotate(var(--rotation, 0deg)); }
          50% { transform: translateY(-10px) rotate(var(--rotation, 0deg)); }
        }
        .animate-float-up {
          animation: float-up 3s ease-in-out infinite;
        }
        @keyframes paste {
          0%, 20% { opacity: 0; transform: scale(0.95); }
          35% { opacity: 1; transform: scale(1.02); }
          45%, 100% { opacity: 1; transform: scale(1); }
        }
        .animate-paste {
          animation: paste 5s ease-out infinite;
        }
        @keyframes button-glow {
          0%, 45% {
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          60%, 80% {
            box-shadow: 0 0 20px rgba(53, 49, 183, 0.5), 0 0 40px rgba(53, 49, 183, 0.3);
          }
          100% {
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
        }
        .animate-button-glow {
          animation: button-glow 5s ease-out infinite;
        }
        @keyframes button-shine {
          0%, 45% {
            opacity: 0;
            transform: translateX(-100%);
          }
          55% {
            opacity: 1;
            transform: translateX(0%);
          }
          65%, 100% {
            opacity: 0;
            transform: translateX(100%);
          }
        }
        .animate-button-shine {
          animation: button-shine 5s ease-out infinite;
        }
        @keyframes gallery-scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-gallery-scroll {
          animation: gallery-scroll 40s linear infinite;
        }
        .gallery-card {
          transform: translateY(0) rotate(0deg);
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
        }
        .gallery-card:hover {
          transform: translateY(-8px) rotate(1deg);
        }
        /* Hero grid cards */
        .hero-grid-card {
          transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
        }
        .hero-grid-card:hover {
          transform: translateY(-6px) scale(1.02);
          box-shadow: 0 20px 40px -12px rgba(53, 49, 183, 0.2);
        }
      `}</style>
    </div>
  );
}


// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function LandingV2({ onStart }: LandingV2Props) {
  return <VersionB onStart={onStart} />;
}
