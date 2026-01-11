import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider, useToast } from './components/Toast';
import { Navbar } from './components/Navbar';
import { BrandConfirmation } from './components/BrandConfirmation';
import { supabase, Brand, generateSlug, isValidDomain, normalizeDomain, getAuthHeaders } from './lib/supabase';
import { useState, useEffect, lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { isAdminUser } from './lib/admin';
import { initAnalytics, trackPageView, track } from './lib/analytics';

// Lazy-loaded page components for code splitting
const LandingV2 = lazy(() => import('./pages/LandingV2').then(m => ({ default: m.LandingV2 })));
const BrandsList = lazy(() => import('./pages/BrandsList').then(m => ({ default: m.BrandsList })));
const BrandKitEditor = lazy(() => import('./pages/BrandKitEditor').then(m => ({ default: m.BrandKitEditor })));
const Studio = lazy(() => import('./pages/Studio').then(m => ({ default: m.Studio })));
const StylesAdmin = lazy(() => import('./pages/StylesAdmin').then(m => ({ default: m.StylesAdmin })));
const AdminImages = lazy(() => import('./pages/AdminImages').then(m => ({ default: m.AdminImages })));
const Pricing = lazy(() => import('./pages/Pricing').then(m => ({ default: m.Pricing })));
const Privacy = lazy(() => import('./pages/Privacy').then(m => ({ default: m.Privacy })));
const Terms = lazy(() => import('./pages/Terms').then(m => ({ default: m.Terms })));

// Loading fallback component
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F7F9' }}>
      <Loader2 className="w-8 h-8 animate-spin text-neutral-600" />
    </div>
  );
}

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F7F9' }}>
        <Loader2 className="w-8 h-8 animate-spin text-neutral-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// Admin-only route wrapper
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F7F9' }}>
        <Loader2 className="w-8 h-8 animate-spin text-neutral-600" />
      </div>
    );
  }

  if (!user || !isAdminUser(user.id)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// Brand context wrapper - loads brand data for nested routes
function BrandRoutes() {
  const { brandSlug } = useParams<{ brandSlug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [wasExtracting, setWasExtracting] = useState(false);

  useEffect(() => {
    if (brandSlug && user) {
      loadBrandBySlug(brandSlug);
    }
  }, [brandSlug, user]);

  const loadBrandBySlug = async (slug: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('brands')
      .select('*')
      .eq('slug', slug)
      .eq('user_id', user?.id)
      .maybeSingle();

    if (error || !data) {
      navigate('/brands');
      return;
    }
    setBrand(data);
    
    // Check if brand was just extracted (updated within last 2 minutes)
    // and needs confirmation
    if (data.status === 'ready' && data.updated_at) {
      const updatedAt = new Date(data.updated_at);
      const now = new Date();
      const minutesSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60);
      
      // Check if confirmation was already shown for this brand
      const confirmationKey = `brand_confirmed_${data.id}`;
      const wasConfirmed = localStorage.getItem(confirmationKey);
      
      // Show confirmation if brand was updated recently and not yet confirmed
      if (minutesSinceUpdate < 2 && !wasConfirmed) {
        setShowConfirmation(true);
      }
    }
    
    if (data.status === 'extracting') {
      setWasExtracting(true);
    }
    
    setLoading(false);
  };

  // Track if brand was extracting to show confirmation when ready
  useEffect(() => {
    if (brand?.status === 'extracting') {
      setWasExtracting(true);
    }
  }, [brand?.status]);

  // Poll for brand updates when status is 'extracting'
  useEffect(() => {
    if (!brand || brand.status !== 'extracting') return;

    let isMounted = true;

    const pollInterval = setInterval(async () => {
      // Skip if component unmounted during async operation
      if (!isMounted) return;

      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .eq('id', brand.id)
        .eq('user_id', user?.id)
        .maybeSingle();

      // Check again after async operation
      if (!isMounted) return;

      if (!error && data) {
        setBrand(data);
        // Stop polling once extraction is complete
        if (data.status !== 'extracting') {
          clearInterval(pollInterval);
          // Show confirmation when extraction completes
          if (wasExtracting && data.status === 'ready') {
            setShowConfirmation(true);
          }
        }
      }
    }, 2000); // Poll every 2 seconds

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [brand?.id, brand?.status, wasExtracting, user?.id]);

  const handleUpdateBrand = async (updates: Partial<Brand>) => {
    if (!brand) return;

    // Update optimistically in the UI immediately
    setBrand(prev => prev ? { ...prev, ...updates, updated_at: new Date().toISOString() } : null);

    // Save to database in the background
    // Note: Don't save styleguide here - it's managed by edge functions (analyze-brand-style)
    // Saving stale styleguide would overwrite ai_extracted_colors
    const { error: updateError } = await supabase
      .from('brands')
      .update({
        colors: updates.colors || brand.colors,
        fonts: updates.fonts || brand.fonts,
        logos: updates.logos || brand.logos,
        all_logos: updates.all_logos || brand.all_logos,
        voice: updates.voice || brand.voice,
        slogan: updates.slogan || brand.slogan,
        updated_at: new Date().toISOString(),
      })
      .eq('id', brand.id);

    if (updateError) {
      console.error('[Brand Update] Failed to save brand updates:', updateError);
      console.error('[Brand Update] Attempted to save:', { logos: updates.logos, colors: updates.colors });
    } else {
      console.log('[Brand Update] Successfully saved:', { logos: updates.logos ? 'updated' : 'unchanged' });
    }

    // Silently refresh in the background without showing loading state
    const { data } = await supabase
      .from('brands')
      .select('*')
      .eq('slug', brand.slug)
      .eq('user_id', user?.id)
      .maybeSingle();
    
    if (data) {
      setBrand(data);
    }
  };

  const handleReExtract = async (): Promise<Partial<Brand> | null> => {
    if (!brand) return null;

    try {
      const url = `https://${brand.domain}`;
      const authHeaders = await getAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-brand`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ url, brandId: brand.id }),
        }
      );

      if (!response.ok) throw new Error('Re-extraction failed');

      const { data: extractedData } = await response.json();
      return {
        name: extractedData.name,
        slogan: extractedData.slogan,
        logos: extractedData.logos,
        all_logos: extractedData.all_logos,
        backdrops: extractedData.backdrops,
        colors: extractedData.colors,
        fonts: extractedData.fonts,
        voice: extractedData.voice,
        styleguide: extractedData.styleguide,
      };
    } catch (error) {
      console.error('Failed to re-extract:', error);
      return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F7F9' }}>
        <Loader2 className="w-8 h-8 animate-spin text-neutral-600" />
      </div>
    );
  }

  if (!brand) {
    return <Navigate to="/brands" replace />;
  }

  // Show confirmation flow if needed
  if (showConfirmation && brand.status === 'ready') {
    return (
      <BrandConfirmation
        brand={brand}
        onConfirm={async (updates) => {
          await handleUpdateBrand(updates);
          setBrand(prev => prev ? { ...prev, ...updates } : null);
        }}
        onComplete={() => {
          setShowConfirmation(false);
          setWasExtracting(false);
          // Mark this brand as confirmed in localStorage
          if (brand) {
            localStorage.setItem(`brand_confirmed_${brand.id}`, 'true');
            // Track brand confirmation
            track('brand_confirmed', { brand_id: brand.id });
          }
        }}
      />
    );
  }

  return (
    <>
      {brand.status !== 'extracting' && <Navbar currentBrand={brand} />}
      <div className={brand.status !== 'extracting' ? 'pt-16' : ''}>
        <Routes>
          <Route 
            index 
            element={
              <BrandKitEditor
                brand={brand}
                onUpdate={handleUpdateBrand}
                onReExtract={handleReExtract}
                onContinue={() => navigate(`/brands/${brand.slug}/studio`)}
                onBack={() => navigate('/brands')}
              />
            } 
          />
          <Route 
            path="studio" 
            element={<Studio brand={brand} />} 
          />
          {/* Redirect old routes to studio */}
          <Route 
            path="create" 
            element={<Navigate to={`/brands/${brand.slug}/studio`} replace />} 
          />
          <Route 
            path="gallery" 
            element={<Navigate to={`/brands/${brand.slug}/studio`} replace />} 
          />
          <Route 
            path="gallery/:imageId" 
            element={<Navigate to={`/brands/${brand.slug}/studio`} replace />} 
          />
        </Routes>
      </div>
    </>
  );
}

// Brands list wrapper
function BrandsListWrapper() {
  const navigate = useNavigate();

  return (
    <>
      <Navbar />
      <div className="pt-16">
        <BrandsList
          onSelectBrand={(slug) => navigate(`/brands/${slug}`)}
          onCreateNew={() => navigate('/')}
        />
      </div>
    </>
  );
}

// New landing page wrapper (V2)
function LandingV2Wrapper() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const handleStartExtraction = async (input: string) => {
    if (!user) return;

    try {
      // Validate domain format
      if (!isValidDomain(input)) {
        toast.error('Invalid Domain', 'Please enter a valid domain name (e.g., example.com)');
        return;
      }

      let domain: string;
      let url: string;

      if (input.includes('://')) {
        domain = new URL(input).hostname;
        url = input;
      } else {
        domain = normalizeDomain(input);
        url = `https://${domain}`;
      }

      domain = normalizeDomain(domain);

      // Track brand extraction started
      track('brand_extraction_started', { domain });

      // Generate a slug for the brand
      const slug = generateSlug(domain);

      const { data: newBrand, error } = await supabase
        .from('brands')
        .insert({
          user_id: user.id,
          domain,
          slug,
          name: domain.replace('www.', '').split('.')[0],
          status: 'extracting',
        })
        .select()
        .single();

      if (error) throw error;

      // Navigate using slug
      navigate(`/brands/${newBrand.slug}`);

      const authHeaders = await getAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-brand-firecrawl`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ url, brandId: newBrand.id }),
        }
      );

      if (!response.ok) throw new Error('Brand extraction failed');

      // Edge function saves all data directly to DB - no need to save again here
      // Polling in BrandRoutes will pick up the changes
      // Removing redundant save prevents overwriting ai_extracted_colors from async analyze-brand-style

    } catch (error) {
      console.error('Failed to start extraction:', error);
    }
  };

  return (
    <LandingV2
      onStart={handleStartExtraction}
      onViewBrands={() => navigate('/brands')}
    />
  );
}

// Track page views on route changes
function PageViewTracker() {
  const location = useLocation();

  useEffect(() => {
    // Extract page name from pathname
    const pathname = location.pathname;
    let pageName = 'home';
    let brandId: string | undefined;

    if (pathname === '/') {
      pageName = 'landing';
    } else if (pathname === '/brands') {
      pageName = 'brands_list';
    } else if (pathname.startsWith('/brands/')) {
      const parts = pathname.split('/');
      brandId = parts[2]; // This is the brand slug, but good enough for tracking
      if (pathname.endsWith('/studio')) {
        pageName = 'studio';
      } else {
        pageName = 'brand_editor';
      }
    } else if (pathname === '/pricing') {
      pageName = 'pricing';
    } else if (pathname === '/privacy') {
      pageName = 'privacy';
    } else if (pathname === '/terms') {
      pageName = 'terms';
    } else if (pathname.startsWith('/admin')) {
      pageName = pathname.replace('/', '').replace('/', '_');
    }

    trackPageView(pageName, brandId);
  }, [location.pathname]);

  return null;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingV2Wrapper />} />
      <Route 
        path="/brands" 
        element={
          <ProtectedRoute>
            <BrandsListWrapper />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/brands/:brandSlug/*" 
        element={
          <ProtectedRoute>
            <BrandRoutes />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/admin/styles" 
        element={
          <ProtectedRoute>
            <>
              <Navbar />
              <div className="pt-16">
                <StylesAdmin />
              </div>
            </>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/admin/images" 
        element={
          <AdminRoute>
            <>
              <Navbar />
              <div className="pt-16">
                <AdminImages />
              </div>
            </>
          </AdminRoute>
        } 
      />
      <Route
        path="/pricing"
        element={
          <>
            <Navbar />
            <div className="pt-16">
              <Pricing />
            </div>
          </>
        }
      />
      <Route
        path="/privacy"
        element={
          <>
            <Navbar />
            <div className="pt-16">
              <Privacy />
            </div>
          </>
        }
      />
      <Route
        path="/terms"
        element={
          <>
            <Navbar />
            <div className="pt-16">
              <Terms />
            </div>
          </>
        }
      />
    </Routes>
  );
}

function App() {
  // Initialize analytics on app mount
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<PageLoader />}>
            <PageViewTracker />
            <AppRoutes />
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
