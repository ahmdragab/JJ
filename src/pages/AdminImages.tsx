import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, ShieldCheck, Image as ImageIcon, History, Clock3, Search, Filter, Bug } from 'lucide-react';
import { supabase, GeneratedImage } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { isAdminUser } from '../lib/admin';
import { Button } from '../components/ui';

type StatusFilter = 'all' | 'ready' | 'generating' | 'error';

// Partial Brand type for list display
type BrandListItem = {
  id: string;
  name: string;
  slug: string;
  domain: string;
  latest_image_at?: string | null;
  image_count?: number;
};

// Debug info from generation functions
type GenerationDebugInfo = {
  brand_logos?: { primary?: string; icon?: string } | null;
  brand_all_logos_count?: number;
  logo_url_used?: string | null;
  logo_fetched?: boolean;
  logo_size_kb?: number | null;
  logo_mime?: string | null;
  assets_count?: number;
  assets_attached?: string[];
  references_count?: number;
  product_id?: string | null;
  product_name?: string | null;
  product_images_count?: number;
  include_logo_reference?: boolean;
};

export function AdminImages() {
  const { user } = useAuth();
  const [brands, setBrands] = useState<BrandListItem[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [loadingImages, setLoadingImages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchPrompt, setSearchPrompt] = useState('');
  const [showVersions, setShowVersions] = useState<Record<string, boolean>>({});

  // Guard: only fetch when the signed-in user is allowed
  const canView = useMemo(() => isAdminUser(user?.id), [user?.id]);

  useEffect(() => {
    if (canView) {
      loadBrands();
      // Load all images by default (no brand selected)
      loadImages(null, statusFilter, searchPrompt);
    }
  }, [canView]);

  useEffect(() => {
    // Load images whenever selection, filter, or search changes
    if (canView) {
      loadImages(selectedBrandId, statusFilter, searchPrompt);
    }
  }, [selectedBrandId, statusFilter, searchPrompt, canView]);

  const loadBrands = async () => {
    setLoadingBrands(true);
    setError(null);

    // Fetch brands
    const { data: brandsData, error: fetchError } = await supabase
      .from('brands')
      .select('id, name, slug, domain');

    if (fetchError) {
      setError('Failed to load brands');
      setLoadingBrands(false);
      return;
    }

    // Fetch latest image per brand to sort by recency
    const { data: latestImages } = await supabase
      .from('images')
      .select('brand_id, created_at')
      .order('created_at', { ascending: false });

    // Build a map of brand_id -> latest_image_at and image_count
    const brandImageMap: Record<string, { latest: string; count: number }> = {};
    if (latestImages) {
      for (const img of latestImages) {
        if (!brandImageMap[img.brand_id]) {
          brandImageMap[img.brand_id] = { latest: img.created_at, count: 1 };
        } else {
          brandImageMap[img.brand_id].count++;
        }
      }
    }

    // Enrich brands with image info and sort by latest image
    const enrichedBrands = (brandsData || []).map(brand => ({
      ...brand,
      latest_image_at: brandImageMap[brand.id]?.latest || null,
      image_count: brandImageMap[brand.id]?.count || 0,
    }));

    // Sort: brands with images first (by recency), then brands without images (alphabetically)
    enrichedBrands.sort((a, b) => {
      if (a.latest_image_at && b.latest_image_at) {
        return new Date(b.latest_image_at).getTime() - new Date(a.latest_image_at).getTime();
      }
      if (a.latest_image_at && !b.latest_image_at) return -1;
      if (!a.latest_image_at && b.latest_image_at) return 1;
      return (a.name || a.domain).localeCompare(b.name || b.domain);
    });

    setBrands(enrichedBrands);
    // Don't auto-select a brand - show all images by default
    setLoadingBrands(false);
  };

  const loadImages = async (brandId: string | null, status: StatusFilter, promptQuery: string) => {
    setLoadingImages(true);
    setError(null);

    let query = supabase
      .from('images')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100); // Limit for performance when showing all

    // Filter by brand if one is selected
    if (brandId) {
      query = query.eq('brand_id', brandId);
    }

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    if (promptQuery.trim()) {
      query = query.ilike('prompt', `%${promptQuery.trim()}%`);
    }

    const { data, error: fetchError } = await query;

    if (fetchError) {
      setError('Failed to load images');
      setImages([]);
      setLoadingImages(false);
      return;
    }

    setImages((data || []) as GeneratedImage[]);
    setLoadingImages(false);
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  const selectedBrand = brands.find(b => b.id === selectedBrandId);

  if (!canView) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="bg-white shadow-sm rounded-2xl p-8 text-center border border-neutral-200">
          <ShieldCheck className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-neutral-800">Access restricted</h2>
          <p className="text-neutral-600 text-sm mt-2">You need admin access to view generated images.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Admin only
            </p>
            <h1 className="text-3xl md:text-4xl font-bold text-neutral-800 mt-2">Generated Images</h1>
            <p className="text-neutral-600 mt-2">
              Browse all generated designs by brand. Only you can see this dashboard.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              loadBrands();
              loadImages(selectedBrandId, statusFilter, searchPrompt);
            }}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-neutral-800">Brands</h3>
              {loadingBrands && <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />}
            </div>

            {loadingBrands ? (
              <div className="text-sm text-neutral-500">Loading brands…</div>
            ) : brands.length === 0 ? (
              <div className="text-sm text-neutral-500">No brands available.</div>
            ) : (
              <div className="space-y-2 max-h-[70vh] overflow-auto pr-1">
                {/* All Images option */}
                <button
                  onClick={() => setSelectedBrandId(null)}
                  className={`w-full text-left px-3 py-2 rounded-xl border transition-colors ${
                    selectedBrandId === null
                      ? 'border-neutral-800 bg-neutral-800 text-white'
                      : 'border-neutral-200 hover:border-neutral-300 bg-white text-neutral-700'
                  }`}
                >
                  <div className="text-sm font-semibold">All Images</div>
                  <div className={selectedBrandId === null ? 'text-neutral-300' : 'text-neutral-500'}>
                    Recent from all brands
                  </div>
                </button>

                <div className="border-t border-neutral-100 my-2" />

                {brands.map((brand) => (
                  <button
                    key={brand.id}
                    onClick={() => setSelectedBrandId(brand.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl border transition-colors ${
                      selectedBrandId === brand.id
                        ? 'border-neutral-800 bg-neutral-800 text-white'
                        : 'border-neutral-200 hover:border-neutral-300 bg-white text-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">{brand.name || brand.domain}</div>
                      {brand.image_count ? (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                          selectedBrandId === brand.id ? 'bg-neutral-700 text-neutral-300' : 'bg-neutral-100 text-neutral-500'
                        }`}>
                          {brand.image_count}
                        </span>
                      ) : null}
                    </div>
                    <div className={selectedBrandId === brand.id ? 'text-neutral-300 text-xs' : 'text-neutral-500 text-xs'}>
                      {brand.domain}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-500 font-semibold">
                  {selectedBrand ? selectedBrand.name : 'All Images'}
                </p>
                <div className="text-neutral-700 text-sm">
                  {images.length} {images.length === 1 ? 'image' : 'images'}
                  {!selectedBrandId && images.length === 100 && ' (showing latest 100)'}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={searchPrompt}
                    onChange={e => setSearchPrompt(e.target.value)}
                    placeholder="Search prompt…"
                    className="pl-9 pr-3 py-2 rounded-full border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary"
                  />
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-neutral-200 text-sm bg-neutral-50">
                  <Filter className="w-4 h-4 text-neutral-500" />
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                    className="bg-transparent focus:outline-none text-neutral-700"
                  >
                    <option value="all">All statuses</option>
                    <option value="ready">Ready</option>
                    <option value="generating">Generating</option>
                    <option value="error">Error</option>
                  </select>
                </div>
              </div>
            </div>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-100">
                {error}
              </div>
            )}

            {loadingImages ? (
              <div className="flex items-center justify-center py-16 text-neutral-500">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading images…
              </div>
            ) : images.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mb-4">
                  <ImageIcon className="w-8 h-8 text-neutral-400" />
                </div>
                <h3 className="text-lg font-semibold text-neutral-800">No images yet</h3>
                <p className="text-neutral-600 text-sm mt-1">
                  {selectedBrandId
                    ? 'Generate an image for this brand to see it here.'
                    : 'No images have been generated yet.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {images.map(image => (
                  <div
                    key={image.id}
                    className="border border-neutral-200 rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="relative aspect-square bg-neutral-100">
                      {image.image_url ? (
                        <img
                          src={image.image_url}
                          alt="Generated"
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-neutral-500">
                          <ImageIcon className="w-8 h-8 mb-2" />
                          <span className="text-xs">No preview</span>
                        </div>
                      )}

                      {image.status === 'generating' && (
                        <span className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs bg-amber-100 text-amber-700 font-medium">
                          Generating
                        </span>
                      )}
                      {image.status === 'error' && (
                        <span className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs bg-red-100 text-red-700 font-medium">
                          Error
                        </span>
                      )}
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="text-sm text-neutral-700 line-clamp-2">{image.prompt}</div>

                      <div className="flex items-center justify-between text-xs text-neutral-500">
                        <div className="flex items-center gap-1.5">
                          <Clock3 className="w-3.5 h-3.5" />
                          {formatDate(image.created_at)}
                        </div>
                        {image.edit_count > 0 && (
                          <span className="px-2 py-0.5 bg-neutral-100 rounded-full">
                            {image.edit_count} edit{image.edit_count === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>

                      {image.version_history?.length ? (
                        <div className="border-t border-neutral-100 pt-3">
                          <button
                            className="flex items-center gap-2 text-xs text-neutral-700 hover:text-neutral-800"
                            onClick={() =>
                              setShowVersions(prev => ({
                                ...prev,
                                [image.id]: !prev[image.id],
                              }))
                            }
                          >
                            <History className="w-4 h-4" />
                            {showVersions[image.id] ? 'Hide versions' : `${image.version_history.length} version(s)`}
                          </button>

                          {showVersions[image.id] && (
                            <div className="mt-2 space-y-2">
                              {image.version_history.map((version, idx) => (
                                <div
                                  key={idx}
                                  className="text-xs text-neutral-600 bg-neutral-50 border border-neutral-100 rounded-lg p-2"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-neutral-700">{formatDate(version.timestamp)}</span>
                                    <a
                                      href={version.image_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-neutral-700 hover:text-neutral-800 underline"
                                    >
                                      Open
                                    </a>
                                  </div>
                                  {version.edit_prompt && (
                                    <p className="text-[11px] text-neutral-500 mt-1 line-clamp-2">
                                      {version.edit_prompt}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* Debug Info Section */}
                      {(image.metadata as { debug?: GenerationDebugInfo })?.debug && (
                        <details className="border-t border-neutral-100 pt-3">
                          <summary className="flex items-center gap-2 text-xs text-neutral-500 hover:text-neutral-700 cursor-pointer">
                            <Bug className="w-3.5 h-3.5" />
                            Generation Debug
                          </summary>
                          <div className="mt-2 p-2 bg-neutral-50 rounded-lg border border-neutral-100 space-y-1.5">
                            {(() => {
                              const debug = (image.metadata as { debug?: GenerationDebugInfo }).debug;
                              if (!debug) return null;
                              return (
                                <>
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-neutral-500">Logo fetched:</span>
                                    <span className={debug.logo_fetched ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                                      {debug.logo_fetched ? 'Yes' : 'No'}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-neutral-500">Logo size:</span>
                                    <span className="text-neutral-700">
                                      {debug.logo_size_kb ? `${debug.logo_size_kb} KB` : 'N/A'}
                                    </span>
                                  </div>
                                  <div className="text-[11px]">
                                    <span className="text-neutral-500">Logo URL:</span>
                                    <div className="text-neutral-600 font-mono text-[10px] truncate mt-0.5" title={debug.logo_url_used || ''}>
                                      {debug.logo_url_used || 'None'}
                                    </div>
                                  </div>
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-neutral-500">Assets:</span>
                                    <span className="text-neutral-700">
                                      {debug.assets_attached?.length || 0}
                                    </span>
                                  </div>
                                  {debug.assets_attached && debug.assets_attached.length > 0 && (
                                    <div className="text-[10px] text-neutral-500 pl-2">
                                      {debug.assets_attached.join(', ')}
                                    </div>
                                  )}
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-neutral-500">References:</span>
                                    <span className="text-neutral-700">{debug.references_count || 0}</span>
                                  </div>
                                  {debug.product_name && (
                                    <div className="flex justify-between text-[11px]">
                                      <span className="text-neutral-500">Product:</span>
                                      <span className="text-neutral-700">{debug.product_name}</span>
                                    </div>
                                  )}
                                  {debug.brand_logos && (
                                    <details className="mt-1">
                                      <summary className="text-[10px] text-neutral-400 cursor-pointer hover:text-neutral-600">
                                        Raw brand logos
                                      </summary>
                                      <pre className="mt-1 text-[9px] font-mono bg-neutral-100 p-1.5 rounded overflow-auto max-h-20">
                                        {JSON.stringify(debug.brand_logos, null, 2)}
                                      </pre>
                                    </details>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

