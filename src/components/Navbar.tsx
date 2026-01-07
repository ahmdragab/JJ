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

interface NavbarProps {
  currentBrand?: Brand;
  credits?: number;
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

  useEffect(() => {
    const isOnBrandsPage = location.pathname === '/brands';
    if (isOnBrandsPage && user && !currentBrand) {
      loadLastBrand();
    }
  }, [location.pathname, user, currentBrand]);

  useEffect(() => {
    if (user && creditsProp === undefined) {
      loadCredits();
    } else if (creditsProp !== undefined) {
      setCredits(creditsProp);
    }
  }, [user, creditsProp]);

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
        (payload: { new: { credits: number } }) => {
          setCredits(payload.new.credits);
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

  const isOnStudioPage = location.pathname.includes('/studio');
  const isOnBrandsPage = location.pathname === '/brands';
  const isOnBrandKitEditor = currentBrand && !isOnStudioPage && !isOnBrandsPage;

  if (!user) return null;

  const activeBrand = currentBrand || (isOnBrandsPage ? lastBrand : null);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
      {/* Gradient backdrop */}
      <div
        className="absolute inset-x-0 top-0 h-24 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgb(248 247 249) 0%, rgb(248 247 249 / 0.95) 40%, rgb(248 247 249 / 0.7) 70%, transparent 100%)',
        }}
      />
      <div className="relative max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-2">

          {/* Left: Logo */}
          <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto shrink-0">
            <button
              onClick={() => navigate('/brands')}
              className="group flex items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 rounded-full hover:bg-white/60 active:bg-white/70 transition-all duration-300 touch-manipulation"
            >
              <img
                src={favIcon}
                alt="Alwan"
                className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full object-cover transition-transform group-hover:scale-105"
              />
            </button>
          </div>

          {/* Center: Brand Switcher */}
          {currentBrand && (
            <div className="absolute left-1/2 transform -translate-x-1/2 pointer-events-auto max-w-[45%] sm:max-w-none" ref={brandMenuRef}>
              <button
                onClick={() => setShowBrandMenu(!showBrandMenu)}
                className="flex items-center gap-1.5 sm:gap-2 pl-2 pr-2.5 py-1.5 rounded-full glass-muted hover:bg-white/80 active:bg-white/90 transition-all duration-300 group touch-manipulation min-h-[40px]"
              >
                {currentBrand.logos?.icon ? (
                  <img
                    src={currentBrand.logos.icon}
                    alt=""
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-md object-contain"
                  />
                ) : (
                  <div
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ backgroundColor: currentBrand.colors?.primary || '#3531B7' }}
                  >
                    {currentBrand.name?.charAt(0) || 'B'}
                  </div>
                )}
                <span className="text-xs sm:text-sm text-neutral-600 group-hover:text-neutral-800 transition-colors truncate max-w-[100px] sm:max-w-[150px]">
                  {normalizeDomain(currentBrand.domain)}
                </span>
                <ChevronDown className={`w-3 h-3 sm:w-3.5 sm:h-3.5 text-neutral-400 transition-transform duration-200 shrink-0 ${showBrandMenu ? 'rotate-180' : ''}`} />
              </button>

              {/* Brand Dropdown */}
              {showBrandMenu && (
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-48 sm:w-56 glass rounded-2xl shadow-xl py-2 animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                  <div className="px-4 py-2 text-xs font-medium text-neutral-400">
                    Your brands
                  </div>
                  {brands.map((brand) => (
                    <button
                      key={brand.id}
                      onClick={() => {
                        if (isOnStudioPage) {
                          navigate(`/brands/${brand.slug}/studio`);
                        } else {
                          navigate(`/brands/${brand.slug}`);
                        }
                        setShowBrandMenu(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50/80 transition-colors ${
                        brand.id === currentBrand.id ? 'bg-neutral-50/60' : ''
                      }`}
                    >
                      {brand.logos?.icon ? (
                        <img
                          src={brand.logos.icon}
                          alt=""
                          className="w-5 h-5 rounded-md object-contain shrink-0"
                        />
                      ) : (
                        <div
                          className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                          style={{ backgroundColor: brand.colors?.primary || '#3531B7' }}
                        >
                          {brand.name?.charAt(0) || 'B'}
                        </div>
                      )}
                      <span className="text-sm text-neutral-700 truncate flex-1 text-left">
                        {normalizeDomain(brand.domain)}
                      </span>
                    </button>
                  ))}
                  <div className="border-t border-neutral-100/80 mt-2 pt-2 mx-2">
                    <button
                      onClick={() => {
                        navigate('/brands');
                        setShowBrandMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-neutral-50/80 transition-colors text-neutral-500"
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
          <div className="flex items-center gap-2 pointer-events-auto shrink-0">

            {/* Credits */}
            <button
              onClick={() => navigate('/pricing')}
              className="flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 gap-1 sm:gap-1.5 px-3 py-2 sm:py-1.5 rounded-full glass-muted hover:bg-white/80 active:bg-white/90 transition-all duration-300 group touch-manipulation"
            >
              <span className="text-sm font-medium text-neutral-700 group-hover:text-neutral-900">{credits}</span>
            </button>

            {/* Studio Button */}
            {activeBrand && !isOnStudioPage && !isOnBrandKitEditor && (
              <button
                onClick={() => navigate(`/brands/${activeBrand.slug}/studio`)}
                className="btn-primary min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 px-3 sm:px-4 py-2 rounded-xl text-sm font-medium shadow-sm hover:shadow-md"
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline ml-1.5">Studio</span>
              </button>
            )}

            {/* User Menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center justify-center w-10 h-10 sm:w-9 sm:h-9 rounded-full bg-white hover:bg-neutral-50 active:bg-neutral-100 shadow-sm hover:shadow-md ring-1 ring-neutral-200/60 transition-all duration-300 text-neutral-700 hover:text-neutral-900 font-medium text-sm touch-manipulation"
              >
                {user.email?.slice(0, 2).toUpperCase() || 'U'}
              </button>

              {/* User Dropdown */}
              {showUserMenu && (
                <div className="absolute top-full right-0 mt-2 w-56 sm:w-64 glass rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* User Info */}
                  <div className="px-4 py-4 bg-gradient-to-br from-neutral-50/80 to-white/50">
                    <p className="text-sm font-medium text-neutral-800 truncate">
                      {user.email}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs text-neutral-500">{credits} credits</span>
                    </div>
                  </div>

                  {/* Menu Items */}
                  <div className="py-2">
                    <button
                      onClick={() => setShowUserMenu(false)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50/80 transition-colors"
                    >
                      <Settings className="w-4 h-4 text-neutral-400" />
                      <span className="text-sm text-neutral-600">Settings</span>
                    </button>
                    <button
                      onClick={() => {
                        navigate('/pricing');
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50/80 transition-colors"
                    >
                      <CreditCard className="w-4 h-4 text-neutral-400" />
                      <span className="text-sm text-neutral-600">Billing & Pricing</span>
                    </button>
                    <button
                      onClick={() => {
                        navigate('/brands');
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50/80 transition-colors"
                    >
                      <FolderOpen className="w-4 h-4 text-neutral-400" />
                      <span className="text-sm text-neutral-600">All brands</span>
                    </button>
                  </div>

                  {/* Sign Out */}
                  <div className="border-t border-neutral-100/80 p-2">
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
