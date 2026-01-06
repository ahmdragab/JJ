import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  ChevronDown, 
  CreditCard, 
  FolderOpen, 
  LogOut, 
  Settings,
  Sparkles
} from 'lucide-react';
import favIcon from '../fav.png';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Brand, getUserCredits, normalizeDomain } from '../lib/supabase';
import { PRIMARY_COLOR } from '../lib/colors';

interface NavbarProps {
  currentBrand?: Brand;
  credits?: number; // Optional - if not provided, will fetch automatically
}

export function Navbar({ currentBrand, credits: creditsProp }: NavbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showBrandMenu, setShowBrandMenu] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [lastBrand, setLastBrand] = useState<Brand | null>(null);
  const [credits, setCredits] = useState<number>(creditsProp ?? 0);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const brandMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (brandMenuRef.current && !brandMenuRef.current.contains(event.target as Node)) {
        setShowBrandMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (showBrandMenu && user) {
      loadBrands();
    }
  }, [showBrandMenu, user]);

  // Load most recent brand when on brands page
  useEffect(() => {
    const isOnBrandsPage = location.pathname === '/brands';
    if (isOnBrandsPage && user && !currentBrand) {
      loadLastBrand();
    }
  }, [location.pathname, user, currentBrand]);

  // Load credits if not provided as prop
  useEffect(() => {
    if (user && creditsProp === undefined) {
      loadCredits();
    } else if (creditsProp !== undefined) {
      setCredits(creditsProp);
    }
  }, [user, creditsProp]);

  // Subscribe to credit updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('user_credits_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_credits',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newCredits = (payload.new as { credits: number }).credits;
          setCredits(newCredits);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const loadCredits = async () => {
    if (!user) return;
    try {
      const userCredits = await getUserCredits();
      setCredits(userCredits);
    } catch (error) {
      console.error('Failed to load credits:', error);
    }
  };

  const loadBrands = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('brands')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(5);
    if (data) setBrands(data);
  };

  const loadLastBrand = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('brands')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setLastBrand(data);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  // Check if we're on studio page
  const isOnStudioPage = location.pathname.includes('/studio');
  const isOnBrandsPage = location.pathname === '/brands';
  // Check if we're on the brand kit editor (brand detail page, not studio)
  const isOnBrandKitEditor = currentBrand && !isOnStudioPage && !isOnBrandsPage;

  if (!user) return null;

  // Use currentBrand if available, otherwise use lastBrand when on brands page
  const activeBrand = currentBrand || (isOnBrandsPage ? lastBrand : null);
  // Use fixed brand color instead of brand's extracted color
  const primaryColor = PRIMARY_COLOR;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
      {/* Gradient backdrop that hides scrolling content */}
      <div 
        className="absolute inset-x-0 top-0 h-24 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgb(250 250 249) 0%, rgb(250 250 249 / 0.95) 40%, rgb(250 250 249 / 0.7) 70%, transparent 100%)',
        }}
      />
      <div className="relative max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-2">
          
          {/* Left: Logo */}
          <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto shrink-0">
            <button 
              onClick={() => navigate('/brands')}
              className="group flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-full hover:bg-white/60 transition-all duration-300"
            >
              <img 
                src={favIcon} 
                alt="Alwan" 
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover transition-transform group-hover:scale-110"
              />
            </button>
          </div>

          {/* Center: Brand Switcher */}
          {currentBrand && (
            <div className="absolute left-1/2 transform -translate-x-1/2 pointer-events-auto" ref={brandMenuRef}>
              <button
                onClick={() => setShowBrandMenu(!showBrandMenu)}
                className="flex items-center gap-1.5 sm:gap-2 pl-1.5 sm:pl-2 pr-2 sm:pr-2.5 py-1 sm:py-1.5 rounded-full bg-white/40 hover:bg-white/70 backdrop-blur-sm transition-all duration-300 group"
              >
                {/* Brand Favicon */}
                {currentBrand.logos?.icon ? (
                  <img 
                    src={currentBrand.logos.icon} 
                    alt="" 
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-md object-contain"
                  />
                ) : (
                  <div 
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ backgroundColor: currentBrand.colors?.primary || '#6366f1' }}
                  >
                    {currentBrand.name?.charAt(0) || 'B'}
                  </div>
                )}
                <span className="text-xs sm:text-sm text-slate-600 group-hover:text-slate-800 transition-colors">
                  {normalizeDomain(currentBrand.domain)}
                </span>
                <ChevronDown className={`w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${showBrandMenu ? 'rotate-180' : ''}`} />
              </button>

                {/* Brand Dropdown */}
                {showBrandMenu && (
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-48 sm:w-56 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/50 py-2 animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                    <div className="px-4 py-2 text-xs font-medium text-slate-400">
                      Your brands
                    </div>
                    {brands.map((brand) => (
                      <button
                        key={brand.id}
                        onClick={() => {
                          // If on studio page, navigate to the selected brand's studio
                          // Otherwise, navigate to the brand page
                          if (isOnStudioPage) {
                            navigate(`/brands/${brand.slug}/studio`);
                          } else {
                            navigate(`/brands/${brand.slug}`);
                          }
                          setShowBrandMenu(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/80 transition-colors ${
                          brand.id === currentBrand.id ? 'bg-slate-50/60' : ''
                        }`}
                      >
                        {/* Brand Favicon in dropdown */}
                        {brand.logos?.icon ? (
                          <img 
                            src={brand.logos.icon} 
                            alt="" 
                            className="w-5 h-5 rounded-md object-contain shrink-0"
                          />
                        ) : (
                          <div 
                            className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                            style={{ backgroundColor: brand.colors?.primary || '#6366f1' }}
                          >
                            {brand.name?.charAt(0) || 'B'}
                          </div>
                        )}
                        <span className="text-sm text-slate-700 truncate flex-1 text-left">
                          {normalizeDomain(brand.domain)}
                        </span>
                      </button>
                    ))}
                    <div className="border-t border-slate-100/80 mt-2 pt-2 mx-2">
                      <button
                        onClick={() => {
                          navigate('/brands');
                          setShowBrandMenu(false);
                        }}
                        className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50/80 transition-colors text-slate-500"
                      >
                        <FolderOpen className="w-4 h-4" />
                        <span className="text-sm">View all brands</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

          {/* Right: Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto shrink-0">
            
            {/* Credits - Minimal pill */}
            <button
              onClick={() => navigate('/pricing')}
              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-white/40 hover:bg-white/70 backdrop-blur-sm transition-all duration-300 group"
            >
              <span className="text-xs sm:text-sm text-slate-600 group-hover:text-slate-800">{credits}</span>
            </button>

            {/* Studio Button - Show when on brands page, but hide on brand kit editor and when already on studio */}
            {activeBrand && !isOnStudioPage && !isOnBrandKitEditor && (
              <button
                onClick={() => navigate(`/brands/${activeBrand.slug}/studio`)}
                className="flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full transition-all duration-300 text-xs sm:text-sm font-medium text-white shadow-sm hover:shadow-md hover:scale-105"
                style={{ 
                  background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`,
                }}
              >
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Studio</span>
              </button>
            )}

            {/* User Menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white hover:bg-slate-50 shadow-sm hover:shadow-md ring-1 ring-slate-200/60 transition-all duration-300 text-slate-700 hover:text-slate-900 font-medium text-xs sm:text-sm"
              >
                {user.email?.slice(0, 2).toUpperCase() || 'U'}
              </button>

              {/* User Dropdown */}
              {showUserMenu && (
                <div className="absolute top-full right-0 mt-2 w-56 sm:w-64 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* User Info */}
                  <div className="px-4 py-4 bg-gradient-to-br from-slate-50/80 to-white/50">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {user.email}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs text-slate-500">{credits} credits</span>
                    </div>
                  </div>

                  {/* Menu Items */}
                  <div className="py-2">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/80 transition-colors"
                    >
                      <Settings className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600">Settings</span>
                    </button>
                    <button
                      onClick={() => {
                        navigate('/pricing');
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/80 transition-colors"
                    >
                      <CreditCard className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600">Billing & Pricing</span>
                    </button>
                    <button
                      onClick={() => {
                        navigate('/brands');
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/80 transition-colors"
                    >
                      <FolderOpen className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600">All brands</span>
                    </button>
                  </div>

                  {/* Sign Out */}
                  <div className="border-t border-slate-100/80 p-2">
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-red-50/80 transition-colors text-red-500"
                    >
                      <LogOut className="w-4 h-4" />
                      <span className="text-sm">Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
