import { useState, useEffect, useRef } from 'react';
import { ArrowRight, Sparkles, Globe, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isValidDomain, supabase } from '../lib/supabase';
import alwanLogo from '../fav.png';

// Example gallery images
import exampleTabby from '../examples/tabby.png';
import exampleDeel1 from '../examples/deel-1.png';
import exampleDeel2 from '../examples/deel-2.png';
import exampleDeel3 from '../examples/deel-3.png';
import exampleLattice from '../examples/lattice.png';
import exampleLattice2 from '../examples/lattice-2.png';
import exampleRippling from '../examples/rippling-1.png';
import exampleDownload from '../examples/download.png';
import exampleDownload1 from '../examples/download (1).png';
import exampleDownload2 from '../examples/download (2).png';
import exampleDownload3 from '../examples/download (3).png';

const galleryImages = [
  exampleTabby,
  exampleDeel1,
  exampleLattice,
  exampleDeel2,
  exampleRippling,
  exampleLattice2,
  exampleDeel3,
  exampleDownload1,
  exampleDownload2,
  exampleDownload3,
];

// ============================================================================
// SHARED TYPES & HOOKS
// ============================================================================

interface LandingV2Props {
  onStart: (url: string) => void;
  onViewBrands?: () => void;
}

interface ShowcaseStyle {
  id: string;
  url: string;
  name: string;
  category: string;
}

// Custom hook to fetch showcase styles from Supabase
function useShowcaseStyles(limit = 6): { styles: ShowcaseStyle[]; loading: boolean } {
  const [styles, setStyles] = useState<ShowcaseStyle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStyles() {
      try {
        const { data, error } = await supabase
          .from('styles')
          .select('id, url, name, category')
          .eq('is_active', true)
          .order('display_order', { ascending: true })
          .limit(limit);

        if (!error && data) {
          setStyles(data);
        }
      } catch (err) {
        console.error('Failed to fetch showcase styles:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchStyles();
  }, [limit]);

  return { styles, loading };
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
  const { user, signInWithGoogle } = useAuth();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const { styles: showcaseStyles } = useShowcaseStyles(6);
  const [activeStep, setActiveStep] = useState(0);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [plansLoading, setPlansLoading] = useState(true);
  const [sectionInView, setSectionInView] = useState(false);
  const howItWorksSectionRef = useRef<HTMLElement>(null);

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
      signInWithGoogle();
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
        <header className="w-full px-6 sm:px-8 lg:px-16 py-5 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <img src={alwanLogo} alt="Alwan" className="h-10 w-auto object-contain" />
            <span className="font-semibold text-xl tracking-tight text-gray-900" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Alwan
            </span>
          </div>

          <div className="flex items-center gap-3">
            <a href="#pricing" className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors hidden sm:block"
               style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Pricing
            </a>
            {user ? (
              <button
                onClick={() => window.location.href = '/brands'}
                className="px-5 py-2.5 rounded-full text-sm font-medium transition-all hover:opacity-90 bg-gray-900 text-white"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                Dashboard
              </button>
            ) : (
              <>
                <button
                  onClick={() => signInWithGoogle()}
                  className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors hidden sm:block"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                >
                  Sign In
                </button>
                <button
                  onClick={() => signInWithGoogle()}
                  className="px-5 py-2.5 rounded-full text-sm font-medium transition-all hover:opacity-90 text-white"
                  style={{ backgroundColor: '#3531B7', fontFamily: "'DM Sans', sans-serif" }}
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
                {/* Social proof badge */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-100 mb-6">
                  <div className="flex -space-x-1.5">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 border-2 border-white" />
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-green-400 to-green-600 border-2 border-white" />
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 border-2 border-white" />
                  </div>
                  <span className="text-xs font-medium text-gray-600" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    Trusted by 200+ businesses
                  </span>
                </div>

                {/* Headline */}
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] mb-5 text-gray-900"
                    style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  Your brand.
                  <br />
                  <span style={{ color: '#3531B7' }}>Infinite ads.</span>
                </h1>

                {/* Subheadline */}
                <p className="text-lg text-gray-500 mb-8 leading-relaxed"
                   style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  Drop your website URL. We extract your brand identity — colors, fonts, logo,
                  voice — and generate scroll-stopping ads for Meta, Google, TikTok, and more.
                  <span className="text-gray-900 font-medium"> In under 30 seconds.</span>
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
                        className="flex-1 bg-transparent outline-none py-3.5 text-gray-900 placeholder:text-gray-400"
                        style={{ fontFamily: "'DM Sans', sans-serif" }}
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-6 py-3.5 rounded-xl text-white font-semibold transition-all hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-2 whitespace-nowrap"
                      style={{ backgroundColor: '#3531B7', fontFamily: "'DM Sans', sans-serif" }}
                    >
                      Generate Ads
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                  {error && (
                    <p className="text-red-500 text-sm mt-2" style={{ fontFamily: "'DM Sans', sans-serif" }}>{error}</p>
                  )}
                </form>

                {/* Trust indicators */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-400" style={{ fontFamily: "'DM Sans', sans-serif" }}>
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
              </div>

              {/* Right: 2x2 grid of example ads */}
              <div className="hidden lg:grid grid-cols-2 gap-4 w-full max-w-md">
                {[exampleDownload, exampleLattice, exampleTabby, exampleDeel2].map((img, index) => (
                  <div
                    key={index}
                    className="hero-grid-card group rounded-2xl overflow-hidden shadow-lg"
                  >
                    <img
                      src={img}
                      alt={`Ad example ${index + 1}`}
                      className="w-full h-auto block transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* How it works - Dynamic Animated Section */}
        <section ref={howItWorksSectionRef} className="px-6 sm:px-8 lg:px-16 py-20 lg:py-28 bg-gray-50">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}>
                From URL to ads in 3 steps
              </h2>
              <p className="text-gray-500 text-lg max-w-2xl mx-auto"
                 style={{ fontFamily: "'DM Sans', sans-serif" }}>
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
                        <h3 className={`text-lg font-semibold mb-1 transition-colors ${
                          activeStep === index ? 'text-gray-900' : 'text-gray-500'
                        }`} style={{ fontFamily: "'DM Sans', sans-serif" }}>
                          {step.title}
                        </h3>
                        <p className={`text-sm transition-colors ${
                          activeStep === index ? 'text-gray-600' : 'text-gray-400'
                        }`} style={{ fontFamily: "'DM Sans', sans-serif" }}>
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
                              yourcompany.com
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
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#3531B7] to-purple-600 mx-auto mb-4 animate-pulse" />
                            <div className="h-3 w-32 bg-gray-200 rounded mx-auto mb-2" />
                            <div className="h-2 w-24 bg-gray-100 rounded mx-auto" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 2: Brand extraction visual */}
                <div className={`absolute inset-0 p-8 transition-all duration-700 ${
                  activeStep === 1 ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8 pointer-events-none'
                }`}>
                  <div className="h-full flex flex-col items-center justify-center">
                    <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                      {/* Colors */}
                      <div className="bg-gray-50 rounded-xl p-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                        <div className="text-xs text-gray-400 mb-2 font-medium">Colors</div>
                        <div className="flex gap-2">
                          <div className="w-8 h-8 rounded-lg bg-[#3531B7] animate-scale-in" style={{ animationDelay: '0.2s' }} />
                          <div className="w-8 h-8 rounded-lg bg-gray-900 animate-scale-in" style={{ animationDelay: '0.3s' }} />
                          <div className="w-8 h-8 rounded-lg bg-gray-100 border animate-scale-in" style={{ animationDelay: '0.4s' }} />
                        </div>
                      </div>
                      {/* Fonts */}
                      <div className="bg-gray-50 rounded-xl p-4 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                        <div className="text-xs text-gray-400 mb-2 font-medium">Fonts</div>
                        <div className="text-lg font-bold text-gray-900">Aa</div>
                        <div className="text-xs text-gray-500">DM Sans</div>
                      </div>
                      {/* Logo */}
                      <div className="bg-gray-50 rounded-xl p-4 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                        <div className="text-xs text-gray-400 mb-2 font-medium">Logo</div>
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3531B7] to-purple-600 flex items-center justify-center">
                          <Sparkles className="w-6 h-6 text-white" />
                        </div>
                      </div>
                      {/* Voice */}
                      <div className="bg-gray-50 rounded-xl p-4 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
                        <div className="text-xs text-gray-400 mb-2 font-medium">Voice</div>
                        <div className="flex flex-wrap gap-1">
                          <span className="text-xs px-2 py-1 bg-[#3531B7]/10 text-[#3531B7] rounded-full">Professional</span>
                          <span className="text-xs px-2 py-1 bg-[#3531B7]/10 text-[#3531B7] rounded-full">Bold</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 3: Generated ads visual */}
                <div className={`absolute inset-0 p-6 transition-all duration-700 ${
                  activeStep === 2 ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8 pointer-events-none'
                }`}>
                  <div className="h-full flex items-center justify-center">
                    <div className="relative w-full max-w-md h-full">
                      {/* Floating ad cards */}
                      {showcaseStyles.slice(0, 3).map((style, i) => (
                        <div
                          key={style.id}
                          className="absolute rounded-xl overflow-hidden shadow-lg animate-float-up"
                          style={{
                            width: i === 1 ? '160px' : '120px',
                            left: i === 0 ? '10%' : i === 1 ? '35%' : '65%',
                            top: i === 0 ? '20%' : i === 1 ? '10%' : '25%',
                            animationDelay: `${i * 0.2}s`,
                            zIndex: i === 1 ? 20 : 10,
                            transform: `rotate(${i === 0 ? -6 : i === 1 ? 0 : 6}deg)`,
                          }}
                        >
                          <img src={style.url} alt={style.name} className="w-full h-auto" />
                        </div>
                      ))}

                      {/* Platform badges */}
                      <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-3">
                        {['Meta', 'Google', 'TikTok'].map((platform, i) => (
                          <div
                            key={platform}
                            className="px-3 py-1.5 bg-white rounded-full shadow-md text-xs font-medium text-gray-600 animate-fade-in-up"
                            style={{ animationDelay: `${0.5 + i * 0.1}s` }}
                          >
                            {platform}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Gallery - Ads created using Alwan */}
        <section className="py-16 lg:py-20 bg-white overflow-hidden">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Ads created using Alwan
            </h2>
            <p className="text-gray-400 text-sm" style={{ fontFamily: "'DM Sans', sans-serif" }}>
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
                  className="gallery-card flex-shrink-0 w-56 sm:w-64 lg:w-72 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer group"
                >
                  <img
                    src={img}
                    alt={`Ad example ${(index % galleryImages.length) + 1}`}
                    className="w-full h-auto block transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
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
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}>
                Simple, transparent pricing
              </h2>
              <p className="text-gray-500 text-lg mb-8"
                 style={{ fontFamily: "'DM Sans', sans-serif" }}>
                Start free. Upgrade when you need more.
              </p>

              {/* Billing Toggle */}
              <div className="flex items-center justify-center gap-4 mb-6">
                <span className={`text-sm font-medium transition-colors ${billingCycle === 'monthly' ? 'text-gray-900' : 'text-gray-400'}`}
                      style={{ fontFamily: "'DM Sans', sans-serif" }}>
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
                <span className={`text-sm font-medium transition-colors flex items-center gap-2 ${billingCycle === 'yearly' ? 'text-gray-900' : 'text-gray-400'}`}
                      style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  Annual
                  {billingCycle === 'yearly' && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                      Save 20%
                    </span>
                  )}
                </span>
              </div>

              <div className="inline-flex items-center gap-2 bg-[#3531B7]/10 text-[#3531B7] px-4 py-2 rounded-xl text-sm font-medium">
                <Sparkles className="w-4 h-4" />
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
                        <h3 className="text-xl font-bold text-gray-900 mb-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                          {plan.display_name}
                        </h3>
                        <p className="text-gray-500 text-sm" style={{ fontFamily: "'DM Sans', sans-serif" }}>
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
                          <span className="text-sm font-medium" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                            {plan.credits_per_month} credits/month
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                            <Check className="w-3 h-3 text-gray-400" />
                          </div>
                          <span className="text-sm" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                            All platforms
                          </span>
                        </div>
                        {plan.features.priority_support && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                              <Check className="w-3 h-3 text-gray-400" />
                            </div>
                            <span className="text-sm" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                              Priority support
                            </span>
                          </div>
                        )}
                        {plan.features.usage_analytics && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                              <Check className="w-3 h-3 text-gray-400" />
                            </div>
                            <span className="text-sm" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                              Usage analytics
                            </span>
                          </div>
                        )}
                      </div>

                      {plan.name === 'free' ? (
                        <button
                          onClick={() => signInWithGoogle()}
                          className="w-full py-3 px-4 rounded-xl font-semibold transition-all bg-gray-100 text-gray-700 hover:bg-gray-200"
                          style={{ fontFamily: "'DM Sans', sans-serif" }}
                        >
                          Get Started
                        </button>
                      ) : (
                        <button
                          onClick={() => signInWithGoogle()}
                          className={`w-full py-3 px-4 rounded-xl font-semibold transition-all ${
                            isRecommended
                              ? 'bg-[#3531B7] text-white hover:opacity-90 shadow-lg shadow-[#3531B7]/25'
                              : 'bg-gray-900 text-white hover:bg-gray-800'
                          }`}
                          style={{ fontFamily: "'DM Sans', sans-serif" }}
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
              <p className="text-gray-500" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                Need more credits or custom solutions?{' '}
                <a href="mailto:support@alwan.io" className="text-[#3531B7] hover:underline font-medium">
                  Contact us
                </a>
              </p>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-6 sm:px-8 lg:px-16 py-20 bg-gray-900">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4"
                style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Ready to create your first ad?
            </h2>
            <p className="text-gray-400 text-lg mb-8"
               style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Join hundreds of businesses creating on-brand ads in seconds.
            </p>
            <button
              onClick={() => signInWithGoogle()}
              className="px-8 py-4 rounded-xl text-gray-900 font-semibold transition-all hover:opacity-90 bg-white text-lg"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              Get Started Free
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 sm:px-8 lg:px-16 py-8 bg-gray-900 border-t border-gray-800">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <img src={alwanLogo} alt="Alwan" className="h-7 w-auto object-contain" />
              <span className="text-sm text-gray-500" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                Alwan — AI-powered brand ads
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-500" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              <a href="#pricing" className="hover:text-gray-300 transition-colors">Pricing</a>
              <a href="mailto:support@alwan.io" className="hover:text-gray-300 transition-colors">Contact</a>
            </div>
          </div>
        </footer>
      </div>

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
// VERSION C: KINETIC SHOWCASE (COMMENTED OUT)
// ============================================================================
//
// This version features a centered layout with sophisticated animations and
// scattered tilted cards (osmo.supply inspired). It was commented out in favor
// of Version B's left-aligned two-column layout based on UX research showing:
//
// 1. F-pattern reading behavior favors left-aligned text for better comprehension
// 2. Left-aligned layouts reduce cognitive load (eyes don't search for line starts)
// 3. Two-column layouts allow pairing text with visual proof (floating ad examples)
// 4. A/B tests show left-to-right visual flow increases CTA clicks by ~24%
//
// The centered layout works well for short headlines but becomes harder to scan
// with description text. Consider uncommenting if testing a minimal-copy approach.
// ============================================================================

/*
function VersionC({ onStart }: { onStart: (url: string) => void }) {
  const { user, signInWithGoogle } = useAuth();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const { styles: showcaseStyles } = useShowcaseStyles(5);

  useEffect(() => {
    // Trigger entrance animations after mount
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

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
      signInWithGoogle();
      return;
    }

    onStart(url.trim());
  };

  const marqueeItems = ['CREATE ADS', 'EXTRACT BRANDS', 'GENERATE DESIGNS', 'LAUNCH CAMPAIGNS', 'SCALE CONTENT'];

  // Scattered card layout positions - mimicking osmo.supply layout (width only)
  const cardLayoutC = [
    { rotation: -12, x: '2%', y: '20%', width: 'w-44', delay: 0.1 },
    { rotation: 4, x: '20%', y: '5%', width: 'w-52', delay: 0.2 },
    { rotation: -6, x: '42%', y: '25%', width: 'w-40', delay: 0.3 },
    { rotation: 12, x: '62%', y: '8%', width: 'w-48', delay: 0.4 },
    { rotation: -4, x: '80%', y: '20%', width: 'w-40', delay: 0.5 },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: '#FAFAFA' }}>
      <div className="absolute inset-0 opacity-[0.02]"
           style={{
             backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
           }} />

      <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full opacity-[0.07] blur-[100px] animate-orb-float"
           style={{ background: 'radial-gradient(circle, #3531B7 0%, transparent 70%)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full opacity-[0.05] blur-[80px] animate-orb-float-delayed"
           style={{ background: 'radial-gradient(circle, #840E25 0%, transparent 70%)' }} />

      <div className="relative z-10 min-h-screen flex flex-col">
        <header className={`w-full px-6 sm:px-10 lg:px-16 py-5 flex justify-between items-center transition-all duration-700 ${
          isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center relative overflow-hidden group"
                 style={{ backgroundColor: '#0D0D31' }}>
              <div className="absolute inset-0 bg-gradient-to-tr from-[#3531B7] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <Sparkles className="w-5 h-5 text-white relative z-10" />
            </div>
            <span className="font-bold text-xl tracking-tight" style={{ color: '#0D0D31', fontFamily: "'Cabinet Grotesk', 'Satoshi', sans-serif" }}>
              AdForge
            </span>
          </div>

          <div className="hidden md:flex items-center">
            <div className="flex items-center gap-1 px-4 py-2 rounded-full border border-gray-200 bg-white/80 backdrop-blur-sm">
              <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ backgroundColor: '#0D0D31', color: 'white' }}>Menu</span>
              <span className="text-sm text-gray-500 px-3" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>Login</span>
              <button
                onClick={() => user ? window.location.href = '/brands' : signInWithGoogle()}
                className="px-4 py-1.5 rounded-full text-sm font-medium text-white transition-all hover:scale-105"
                style={{ backgroundColor: '#84CC16', color: '#0D0D31', fontFamily: "'Cabinet Grotesk', sans-serif" }}
              >
                {user ? 'Dashboard' : 'Join'}
              </button>
            </div>
          </div>

          <button
            onClick={() => user ? window.location.href = '/brands' : signInWithGoogle()}
            className="md:hidden px-4 py-2 rounded-full text-sm font-medium"
            style={{ backgroundColor: '#84CC16', color: '#0D0D31', fontFamily: "'Cabinet Grotesk', sans-serif" }}
          >
            {user ? 'Dashboard' : 'Join'}
          </button>
        </header>

        <div className={`w-full overflow-hidden py-2.5 border-y transition-all duration-700 delay-100 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`} style={{ borderColor: '#0D0D31', backgroundColor: '#0D0D31' }}>
          <div className="flex animate-marquee-fast whitespace-nowrap">
            {[...marqueeItems, ...marqueeItems, ...marqueeItems, ...marqueeItems].map((item, i) => (
              <span key={i} className="mx-6 text-xs font-medium tracking-[0.2em] flex items-center gap-4"
                    style={{ color: 'white', fontFamily: "'Cabinet Grotesk', sans-serif" }}>
                <span className="text-[#84CC16]">✦</span>
                {item}
              </span>
            ))}
          </div>
        </div>

        <main className="flex-1 flex flex-col items-center px-6 sm:px-10 lg:px-16 pt-12 lg:pt-16">
          <div className="text-center max-w-4xl mx-auto mb-8 lg:mb-12">
            <h1 className={`text-5xl sm:text-6xl lg:text-8xl font-bold leading-[0.9] tracking-tight mb-6 transition-all duration-1000 delay-200 ${
              isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`} style={{ color: '#0D0D31', fontFamily: "'Cabinet Grotesk', 'Satoshi', sans-serif" }}>
              Ad Creation{' '}
              <span className="inline-flex items-center justify-center mx-2">
                <span className="inline-block animate-icon-spin" style={{ color: '#3531B7' }}>✦</span>
              </span>
              {' '}Made
              <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#3531B7] via-[#840E25] to-[#3531B7] animate-gradient-shift bg-[length:200%_100%]">
                Effortless
              </span>
            </h1>

            <p className={`text-lg sm:text-xl text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed transition-all duration-1000 delay-300 ${
              isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`} style={{ fontFamily: "'General Sans', sans-serif" }}>
              Platform packed with{' '}
              <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">brand extraction</span>
              {' '}&{' '}
              <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">AI generation</span>
              {' '}tools,
              <br className="hidden sm:block" />
              templates, formats, and a complete ad creation workflow.
            </p>

            <form onSubmit={handleSubmit} className={`max-w-xl mx-auto transition-all duration-1000 delay-400 ${
              isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              <div className={`flex items-center gap-2 p-2 rounded-2xl bg-white shadow-xl shadow-black/[0.08] border-2 transition-all duration-300 ${
                error ? 'border-red-300' : 'border-transparent hover:border-gray-200 focus-within:border-[#3531B7]'
              }`}>
                <div className="flex items-center gap-3 flex-1 px-3">
                  <Globe className="w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setError(''); }}
                    placeholder="yourwebsite.com"
                    className="flex-1 bg-transparent outline-none py-3 text-gray-900"
                    style={{ fontFamily: "'General Sans', sans-serif" }}
                  />
                </div>
                <button
                  type="submit"
                  className="px-6 py-3 rounded-xl text-white font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 group"
                  style={{ backgroundColor: '#0D0D31', fontFamily: "'Cabinet Grotesk', sans-serif" }}
                >
                  Generate Ads
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
              {error && (
                <p className="text-red-500 text-sm mt-3 animate-shake" style={{ fontFamily: "'General Sans', sans-serif" }}>{error}</p>
              )}
            </form>
          </div>

          <div className={`relative w-full max-w-6xl mx-auto h-[400px] sm:h-[450px] lg:h-[500px] mt-4 transition-all duration-1000 delay-500 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}>
            {showcaseStyles.slice(0, 5).map((style, index) => {
              const layout = cardLayoutC[index];
              const isHovered = hoveredCard === index;
              return (
                <div
                  key={style.id}
                  className={`absolute ${layout.width} rounded-2xl overflow-hidden shadow-2xl shadow-black/20 cursor-pointer transition-all duration-500 ease-out animate-card-float group`}
                  style={{
                    left: layout.x,
                    top: layout.y,
                    transform: `rotate(${isHovered ? layout.rotation * 0.3 : layout.rotation}deg) scale(${isHovered ? 1.08 : 1})`,
                    zIndex: isHovered ? 50 : 10 + index,
                    animationDelay: `${layout.delay}s`,
                    ['--float-offset' as string]: `${index * 0.5}s`,
                  }}
                  onMouseEnter={() => setHoveredCard(index)}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  <img
                    src={style.url}
                    alt={style.name}
                    className="w-full h-auto block rounded-2xl"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/25 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl" />
                </div>
              );
            })}

            <div className="absolute top-[10%] left-[35%] w-3 h-3 rounded-full animate-float-slow" style={{ backgroundColor: '#3531B7' }} />
            <div className="absolute bottom-[30%] right-[20%] w-2 h-2 rounded-full animate-float-slow-delayed" style={{ backgroundColor: '#840E25' }} />
            <div className="absolute top-[40%] right-[5%] w-4 h-4 rounded-full animate-float-slow" style={{ backgroundColor: '#84CC16' }} />
          </div>
        </main>
      </div>

      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <link href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@400,500,700,800&f[]=general-sans@400,500,600&f[]=satoshi@400,500,700&display=swap" rel="stylesheet" />

      <style>{\`
        @keyframes marquee-fast {
          0% { transform: translateX(0); }
          100% { transform: translateX(-25%); }
        }
        .animate-marquee-fast {
          animation: marquee-fast 15s linear infinite;
        }

        @keyframes orb-float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
        }
        .animate-orb-float {
          animation: orb-float 20s ease-in-out infinite;
        }
        .animate-orb-float-delayed {
          animation: orb-float 25s ease-in-out infinite;
          animation-delay: -10s;
        }

        @keyframes icon-spin {
          0%, 100% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.1); }
        }
        .animate-icon-spin {
          animation: icon-spin 4s ease-in-out infinite;
        }

        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient-shift {
          animation: gradient-shift 4s ease-in-out infinite;
        }

        @keyframes card-float {
          0%, 100% {
            transform: translateY(0) rotate(var(--rotation, 0deg));
          }
          50% {
            transform: translateY(-15px) rotate(calc(var(--rotation, 0deg) + 1deg));
          }
        }
        .animate-card-float {
          animation: card-float 6s ease-in-out infinite;
          animation-delay: var(--float-offset, 0s);
        }

        @keyframes float-slow {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.6; }
          50% { transform: translateY(-20px) scale(1.2); opacity: 1; }
        }
        .animate-float-slow {
          animation: float-slow 5s ease-in-out infinite;
        }
        .animate-float-slow-delayed {
          animation: float-slow 7s ease-in-out infinite;
          animation-delay: -3s;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.3s ease-in-out;
        }
      \`}</style>
    </div>
  );
}
*/

// ============================================================================
// MAIN COMPONENT
// ============================================================================
// Now using Version B (Alwan) as the primary landing page.
// Version A was removed, Version C is commented out above for reference.

export function LandingV2({ onStart }: LandingV2Props) {
  return <VersionB onStart={onStart} />;
}
