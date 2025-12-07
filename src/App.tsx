import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Landing } from './pages/Landing';
import { BrandsList } from './pages/BrandsList';
import { BrandKitEditor } from './pages/BrandKitEditor';
import { Studio } from './pages/Studio';
import { StylesAdmin } from './pages/StylesAdmin';
import { Navbar } from './components/Navbar';
import { supabase, Brand, generateSlug } from './lib/supabase';
import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
      </div>
    );
  }

  if (!user) {
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
      .maybeSingle();

    if (error || !data) {
      navigate('/brands');
      return;
    }
    setBrand(data);
    setLoading(false);
  };

  const handleUpdateBrand = async (updates: Partial<Brand>) => {
    if (!brand) return;

    // Update optimistically in the UI immediately
    setBrand(prev => prev ? { ...prev, ...updates, updated_at: new Date().toISOString() } : null);

    // Save to database in the background
    await supabase
      .from('brands')
      .update({
        colors: updates.colors || brand.colors,
        fonts: updates.fonts || brand.fonts,
        logos: updates.logos || brand.logos,
        all_logos: updates.all_logos || brand.all_logos,
        voice: updates.voice || brand.voice,
        slogan: updates.slogan || brand.slogan,
        styleguide: updates.styleguide || brand.styleguide,
        updated_at: new Date().toISOString(),
      })
      .eq('id', brand.id);

    // Silently refresh in the background without showing loading state
    const { data } = await supabase
      .from('brands')
      .select('*')
      .eq('slug', brand.slug)
      .maybeSingle();
    
    if (data) {
      setBrand(data);
    }
  };

  const handleReExtract = async (): Promise<Partial<Brand> | null> => {
    if (!brand) return null;
    
    try {
      const url = `https://${brand.domain}`;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-brand`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ url }),
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
      </div>
    );
  }

  if (!brand) {
    return <Navigate to="/brands" replace />;
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

// Landing wrapper with navigation
function LandingWrapper() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleStartExtraction = async (input: string) => {
    if (!user) return;

    try {
      let domain: string;
      let url: string;
      
      if (input.includes('://')) {
        domain = new URL(input).hostname;
        url = input;
      } else {
        domain = input.replace(/^www\./, '').trim();
        url = `https://${domain}`;
      }
      
      domain = domain.replace(/^www\./, '');

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

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-brand-firecrawl`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ url, brandId: newBrand.id }),
        }
      );

      if (!response.ok) throw new Error('Brand extraction failed');

      const { data: extractedData } = await response.json();

      await supabase
        .from('brands')
        .update({
          name: extractedData.name,
          slogan: extractedData.slogan,
          logos: extractedData.logos,
          all_logos: extractedData.all_logos,
          backdrops: extractedData.backdrops,
          colors: extractedData.colors,
          fonts: extractedData.fonts,
          voice: extractedData.voice,
          styleguide: extractedData.styleguide,
          screenshot: extractedData.screenshot,
          page_images: extractedData.page_images,
          status: 'ready',
        })
        .eq('id', newBrand.id);

    } catch (error) {
      console.error('Failed to start extraction:', error);
    }
  };

  return (
    <Landing 
      onStart={handleStartExtraction} 
      onViewBrands={() => navigate('/brands')} 
    />
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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingWrapper />} />
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
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
