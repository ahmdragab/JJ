import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Loader2, Trash2, Calendar, Sparkles, ImageIcon } from 'lucide-react';
import { supabase, Brand, GeneratedImage } from '../lib/supabase';

export function Gallery({ brand }: { brand: Brand }) {
  const navigate = useNavigate();
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const primaryColor = brand.colors?.primary || '#1a1a1a';

  useEffect(() => {
    loadImages();
  }, [brand.id]);

  const loadImages = async () => {
    try {
      const { data, error } = await supabase
        .from('images')
        .select('*')
        .eq('brand_id', brand.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setImages(data || []);
    } catch (error) {
      console.error('Failed to load images:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (imageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this image?')) return;

    setDeleting(imageId);
    try {
      const { error } = await supabase
        .from('images')
        .delete()
        .eq('id', imageId);

      if (error) throw error;
      setImages(images.filter(img => img.id !== imageId));
    } catch (error) {
      console.error('Failed to delete image:', error);
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50 relative overflow-hidden">
      {/* Subtle background texture */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"
          style={{ backgroundColor: primaryColor }}
        />
        <div 
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"
          style={{ backgroundColor: primaryColor }}
        />
      </div>

      <div className="relative z-10 p-6 md:p-12">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-12">
            <button
              onClick={() => navigate(`/brands/${brand.slug}`)}
              className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm rounded-full text-slate-600 hover:text-slate-900 hover:bg-white shadow-sm transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Back to Brand</span>
            </button>

            <button
              onClick={() => navigate(`/brands/${brand.slug}/create`)}
              className="flex items-center gap-2 px-6 py-3 rounded-full text-white font-medium transition-all hover:shadow-lg hover:scale-105"
              style={{ backgroundColor: primaryColor }}
            >
              <Plus className="w-5 h-5" />
              Create New
            </button>
          </div>

          {/* Title */}
          <div className="mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-3">
              Your Gallery
            </h1>
            <p className="text-lg text-slate-600 font-light">
              {images.length} {images.length === 1 ? 'creation' : 'creations'} for {brand.name}
            </p>
          </div>

          {/* Gallery Grid */}
          {images.length === 0 ? (
            <div className="text-center py-20">
              <div className="max-w-md mx-auto">
                <div 
                  className="w-24 h-24 rounded-3xl mx-auto mb-6 flex items-center justify-center"
                  style={{ backgroundColor: `${primaryColor}10` }}
                >
                  <ImageIcon className="w-12 h-12" style={{ color: primaryColor }} />
                </div>
                <h3 className="text-2xl font-bold text-slate-800 mb-3">
                  No images yet
                </h3>
                <p className="text-slate-600 mb-8">
                  Start creating on-brand images for your business
                </p>
                <button
                  onClick={() => navigate(`/brands/${brand.slug}/create`)}
                  className="px-8 py-4 rounded-full text-white font-medium text-lg transition-all hover:shadow-lg hover:scale-105"
                  style={{ backgroundColor: primaryColor }}
                >
                  Create Your First Image
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {images.map((image) => (
                <div
                  key={image.id}
                  onClick={() => navigate(`/brands/${brand.slug}/gallery/${image.id}`)}
                  className="group relative bg-white/70 backdrop-blur-sm rounded-3xl overflow-hidden cursor-pointer hover:bg-white hover:shadow-xl transition-all duration-300 border border-slate-200/50"
                >
                  {/* Image Preview */}
                  <div className="aspect-square bg-slate-100 relative overflow-hidden">
                    {image.image_url ? (
                      <img
                        src={image.image_url}
                        alt="Generated"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : image.status === 'generating' ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center">
                          <Loader2 className="w-10 h-10 animate-spin text-slate-400 mx-auto mb-3" />
                          <p className="text-sm text-slate-500">Generating...</p>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Sparkles className="w-12 h-12 text-slate-300" />
                      </div>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />

                    {/* Delete button */}
                    <button
                      onClick={(e) => handleDelete(image.id, e)}
                      disabled={deleting === image.id}
                      className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 text-slate-600 hover:text-red-600"
                    >
                      {deleting === image.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>

                    {/* Status badge */}
                    {image.status === 'generating' && (
                      <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                        Generating
                      </div>
                    )}
                    {image.status === 'error' && (
                      <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                        Error
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-5">
                    <p className="text-sm text-slate-700 line-clamp-2 mb-3 font-light">
                      {image.prompt.length > 100 ? image.prompt.slice(0, 100) + '...' : image.prompt}
                    </p>
                    
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(image.created_at)}
                      </div>
                      {image.edit_count > 0 && (
                        <span className="px-2 py-0.5 bg-slate-100 rounded-full">
                          {image.edit_count} edit{image.edit_count !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .animate-blob { animation: blob 7s infinite; }
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}

