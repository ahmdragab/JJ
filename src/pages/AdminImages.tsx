import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, ShieldCheck, Image as ImageIcon, History, Clock3, Search, Filter } from 'lucide-react';
import { supabase, GeneratedImage } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { isAdminUser } from '../lib/admin';

type StatusFilter = 'all' | 'ready' | 'generating' | 'error';

// Partial Brand type for list display
type BrandListItem = {
  id: string;
  name: string;
  slug: string;
  domain: string;
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
    }
  }, [canView]);

  useEffect(() => {
    if (selectedBrandId) {
      loadImages(selectedBrandId, statusFilter, searchPrompt);
    }
  }, [selectedBrandId, statusFilter, searchPrompt]);

  const loadBrands = async () => {
    setLoadingBrands(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('brands')
      .select('id, name, slug, domain')
      .order('name', { ascending: true });

    if (fetchError) {
      setError('Failed to load brands');
      setLoadingBrands(false);
      return;
    }

    setBrands(data || []);
    if (!selectedBrandId && data && data.length > 0) {
      setSelectedBrandId(data[0].id);
    }
    setLoadingBrands(false);
  };

  const loadImages = async (brandId: string, status: StatusFilter, promptQuery: string) => {
    setLoadingImages(true);
    setError(null);

    let query = supabase
      .from('images')
      .select('*')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false });

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50">
        <div className="bg-white shadow-sm rounded-2xl p-8 text-center border border-slate-200/60">
          <ShieldCheck className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-slate-900">Access restricted</h2>
          <p className="text-slate-600 text-sm mt-2">You need admin access to view generated images.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Admin only
            </p>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mt-2">Generated Images</h1>
            <p className="text-slate-600 mt-2">
              Browse all generated designs by brand. Only you can see this dashboard.
            </p>
          </div>
          <button
            onClick={() => selectedBrandId && loadImages(selectedBrandId, statusFilter, searchPrompt)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white shadow-sm border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/70 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">Brands</h3>
              {loadingBrands && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
            </div>

            {loadingBrands ? (
              <div className="text-sm text-slate-500">Loading brands…</div>
            ) : brands.length === 0 ? (
              <div className="text-sm text-slate-500">No brands available.</div>
            ) : (
              <div className="space-y-2 max-h-[70vh] overflow-auto pr-1">
                {brands.map((brand) => (
                  <button
                    key={brand.id}
                    onClick={() => setSelectedBrandId(brand.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl border transition-colors ${
                      selectedBrandId === brand.id
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-800'
                    }`}
                  >
                    <div className="text-sm font-semibold">{brand.name || brand.domain}</div>
                    <div className={selectedBrandId === brand.id ? 'text-slate-200' : 'text-slate-500'}>
                      {brand.domain}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/70 p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                  {selectedBrand ? selectedBrand.name : 'Select a brand'}
                </p>
                <div className="text-slate-700 text-sm">
                  {images.length} {images.length === 1 ? 'image' : 'images'}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={searchPrompt}
                    onChange={e => setSearchPrompt(e.target.value)}
                    placeholder="Search prompt…"
                    className="pl-9 pr-3 py-2 rounded-full border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-slate-200 text-sm bg-slate-50">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                    className="bg-transparent focus:outline-none text-slate-700"
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
              <div className="flex items-center justify-center py-16 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading images…
              </div>
            ) : images.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                  <ImageIcon className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">No images yet</h3>
                <p className="text-slate-600 text-sm mt-1">Generate an image for this brand to see it here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {images.map(image => (
                  <div
                    key={image.id}
                    className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="relative aspect-square bg-slate-100">
                      {image.image_url ? (
                        <img
                          src={image.image_url}
                          alt="Generated"
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
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
                      <div className="text-sm text-slate-700 line-clamp-2">{image.prompt}</div>

                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <Clock3 className="w-3.5 h-3.5" />
                          {formatDate(image.created_at)}
                        </div>
                        {image.edit_count > 0 && (
                          <span className="px-2 py-0.5 bg-slate-100 rounded-full">
                            {image.edit_count} edit{image.edit_count === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>

                      {image.version_history?.length ? (
                        <div className="border-t border-slate-100 pt-3">
                          <button
                            className="flex items-center gap-2 text-xs text-slate-700 hover:text-slate-900"
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
                                  className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-2"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-700">{formatDate(version.timestamp)}</span>
                                    <a
                                      href={version.image_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-slate-700 hover:text-slate-900 underline"
                                    >
                                      Open
                                    </a>
                                  </div>
                                  {version.edit_prompt && (
                                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                                      {version.edit_prompt}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
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

