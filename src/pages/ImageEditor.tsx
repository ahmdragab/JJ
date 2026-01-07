import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Loader2, Download, RefreshCw, Sparkles, MessageCircle, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase, Brand, GeneratedImage, ConversationMessage, getAuthHeaders } from '../lib/supabase';
import { PRIMARY_COLOR } from '../lib/colors';
import { useToast } from '../components/Toast';

export function ImageEditor({ brand }: { brand: Brand }) {
  const { imageId } = useParams<{ imageId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [image, setImage] = useState<GeneratedImage | null>(null);
  const [loading, setLoading] = useState(true);
  const [editPrompt, setEditPrompt] = useState('');
  const [editing, setEditing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Use fixed brand color instead of brand's extracted color
  const primaryColor = PRIMARY_COLOR;

  // Get all versions (history + current)
  const getAllVersions = (img: GeneratedImage | null): Array<{ image_url: string; edit_prompt?: string; timestamp: string }> => {
    if (!img) return [];
    
    const versions: Array<{ image_url: string; edit_prompt?: string; timestamp: string }> = [];
    
    // Add version history (oldest first)
    if (img.version_history && Array.isArray(img.version_history)) {
      versions.push(...img.version_history);
    }
    
    // Add current version (newest)
    if (img.image_url) {
      versions.push({
        image_url: img.image_url,
        timestamp: img.updated_at,
      });
    }
    
    return versions;
  };

  const navigateVersion = (direction: number, totalVersions: number) => {
    setCurrentVersionIndex((prev) => {
      const newIndex = prev + direction;
      return Math.max(0, Math.min(totalVersions - 1, newIndex));
    });
  };

  useEffect(() => {
    if (imageId) {
      loadImage(imageId);
    }
  }, [imageId]);

  useEffect(() => {
    // Poll for image if still generating
    if (image?.status === 'generating') {
      const interval = setInterval(() => loadImage(imageId!), 2000);
      return () => clearInterval(interval);
    }
  }, [image?.status, imageId]);

  useEffect(() => {
    // Scroll chat to bottom
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [image?.conversation]);

  useEffect(() => {
    // Reset to latest version when image loads or updates
    if (image) {
      const totalVersions = (image.version_history?.length || 0) + (image.image_url ? 1 : 0);
      setCurrentVersionIndex(totalVersions - 1);
    }
  }, [image?.id, image?.image_url, image?.version_history]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return; // Don't navigate when typing in inputs
      }

      const versions = getAllVersions(image);
      if (versions.length <= 1) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateVersion(-1, versions.length);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateVersion(1, versions.length);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, currentVersionIndex]);

  const loadImage = async (id: string) => {
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      navigate(`/brands/${brand.slug}/gallery`);
      return;
    }
    // Ensure version_history is always an array
    const imageData = {
      ...data,
      version_history: Array.isArray(data.version_history) ? data.version_history : [],
    };
    setImage(imageData);
    setLoading(false);
  };

  const handleEdit = async () => {
    if (!editPrompt.trim() || !image || editing) return;
    if (image.edit_count >= image.max_edits) {
      toast.warning('Edit Limit Reached', `You've reached the maximum of ${image.max_edits} edits for this image. Create a new image to continue.`);
      return;
    }

    setEditing(true);
    // Save the prompt before clearing it
    const promptText = editPrompt.trim();
    const userMessage: ConversationMessage = {
      role: 'user',
      content: promptText,
      timestamp: new Date().toISOString(),
    };

    // Optimistically add user message
    const updatedConversation = [...(image.conversation || []), userMessage];
    setImage(prev => prev ? { ...prev, conversation: updatedConversation } : null);
    setEditPrompt('');

    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/edit-image`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            prompt: promptText,
            brandId: brand.id,
            imageId: image.id,
            previousImageUrl: image.image_url,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Edit failed');
      }

      // Reload the image to get updated data
      await loadImage(image.id);
      setShowChat(true);
    } catch (error) {
      console.error('Failed to edit:', error);
      // Remove the optimistic message on error
      setImage(prev => prev ? { ...prev, conversation: image.conversation } : null);
    } finally {
      setEditing(false);
    }
  };

  const handleDownload = async () => {
    if (!image?.image_url) return;

    try {
      // Extract the file path from the Supabase Storage URL
      // Supabase Storage URLs are like: https://[project].supabase.co/storage/v1/object/public/brand-images/[path]
      const urlParts = image.image_url.split('/brand-images/');
      if (urlParts.length === 2) {
        const filePath = urlParts[1];
        
        // Download directly from storage with no transformations
        // Use the download method to get the original file
        const { data, error } = await supabase.storage
          .from('brand-images')
          .download(filePath);
        
        if (error) {
          console.error('Storage download error:', error);
          // Fallback to fetching from URL
          const response = await fetch(image.image_url);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${brand.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          return;
        }
        
        // Create download link with the original file
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${brand.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Fallback for non-Supabase URLs
        const response = await fetch(image.image_url);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${brand.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleStartNew = () => {
    navigate(`/brands/${brand.slug}/create`);
  };

  const versions = getAllVersions(image);
  const currentVersion = versions[currentVersionIndex] || versions[versions.length - 1] || null;
  const canNavigateLeft = currentVersionIndex > 0;
  const canNavigateRight = currentVersionIndex < versions.length - 1;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
      </div>
    );
  }

  if (!image) {
    return null;
  }

  const editsRemaining = image.max_edits - image.edit_count;
  const canEdit = editsRemaining > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50 flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 p-4 md:p-6 flex items-center justify-between border-b border-slate-200/50 bg-white/50 backdrop-blur-sm">
        <button
          onClick={() => navigate(`/brands/${brand.slug}/gallery`)}
          className="flex items-center gap-2 px-4 py-2 bg-white/80 rounded-full text-slate-600 hover:text-slate-900 hover:bg-white shadow-sm transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Gallery</span>
        </button>

        <div className="flex items-center gap-3">
          {image.image_url && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-white/80 rounded-full text-slate-600 hover:text-slate-900 hover:bg-white shadow-sm transition-all"
            >
              <Download className="w-4 h-4" />
              <span className="text-sm font-medium hidden md:inline">Download</span>
            </button>
          )}
          <button
            onClick={handleStartNew}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-white transition-all hover:shadow-lg"
            style={{ backgroundColor: primaryColor }}
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">New Image</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Image Panel */}
        <div className="flex-1 p-4 md:p-8 flex items-center justify-center overflow-auto">
          <div className="relative max-w-3xl w-full">
            {image.status === 'generating' ? (
              <div className="aspect-square bg-white/80 rounded-3xl flex items-center justify-center shadow-lg">
                <div className="text-center">
                  <div 
                    className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center animate-pulse"
                    style={{ backgroundColor: `${primaryColor}20` }}
                  >
                    <Sparkles className="w-10 h-10" style={{ color: primaryColor }} />
                  </div>
                  <p className="text-lg font-medium text-slate-700 mb-2">Creating your image...</p>
                  <p className="text-sm text-slate-500">This may take a few moments</p>
                </div>
              </div>
            ) : currentVersion?.image_url ? (
                <div className="relative group">
                  {/* Navigation Arrows */}
                  {versions.length > 1 && (
                    <>
                      <button
                        onClick={() => navigateVersion(-1, versions.length)}
                        disabled={!canNavigateLeft}
                        className={`absolute left-4 top-1/2 -translate-y-1/2 z-20 p-4 rounded-full bg-white backdrop-blur-sm shadow-xl border-2 border-slate-200 transition-all ${
                          canNavigateLeft
                            ? 'hover:bg-slate-50 hover:scale-110 cursor-pointer opacity-100'
                            : 'opacity-30 cursor-not-allowed'
                        }`}
                        aria-label="Previous version"
                      >
                        <ChevronLeft className="w-7 h-7 text-slate-700" />
                      </button>
                      <button
                        onClick={() => navigateVersion(1, versions.length)}
                        disabled={!canNavigateRight}
                        className={`absolute right-4 top-1/2 -translate-y-1/2 z-20 p-4 rounded-full bg-white backdrop-blur-sm shadow-xl border-2 border-slate-200 transition-all ${
                          canNavigateRight
                            ? 'hover:bg-slate-50 hover:scale-110 cursor-pointer opacity-100'
                            : 'opacity-30 cursor-not-allowed'
                        }`}
                        aria-label="Next version"
                      >
                        <ChevronRight className="w-7 h-7 text-slate-700" />
                      </button>
                    </>
                  )}

                {/* Version Indicator */}
                {versions.length > 1 && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-full bg-white/90 backdrop-blur-sm shadow-lg">
                    <span className="text-sm font-medium text-slate-700">
                      Version {currentVersionIndex + 1} of {versions.length}
                    </span>
                    {currentVersion.edit_prompt && (
                      <span className="text-xs text-slate-500 block mt-1 text-center">
                        {currentVersion.edit_prompt}
                      </span>
                    )}
                  </div>
                )}

                <img
                  src={currentVersion.image_url}
                  alt={`Generated version ${currentVersionIndex + 1}`}
                  className="w-full rounded-3xl shadow-2xl transition-opacity duration-300"
                />
                {editing && (
                  <div className="absolute inset-0 bg-black/30 rounded-3xl flex items-center justify-center">
                    <div className="text-center text-white">
                      <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" />
                      <p className="font-medium">Applying your edits...</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="aspect-square bg-white/80 rounded-3xl flex items-center justify-center shadow-lg">
                <div className="text-center">
                  <RefreshCw className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">Image not available</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chat/Edit Panel */}
        <div className="lg:w-96 border-t lg:border-t-0 lg:border-l border-slate-200/50 bg-white/50 backdrop-blur-sm flex flex-col">
          {/* Chat Toggle (mobile) */}
          <button
            onClick={() => setShowChat(!showChat)}
            className="lg:hidden p-4 flex items-center justify-between border-b border-slate-200/50"
          >
            <span className="font-medium text-slate-700 flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              Edit Conversation
            </span>
            {showChat ? <X className="w-5 h-5" /> : <span className="text-sm text-slate-500">{image.conversation?.length || 0} messages</span>}
          </button>

          {/* Chat Content */}
          <div className={`flex-1 flex flex-col ${showChat ? 'block' : 'hidden lg:flex'}`}>
            {/* Version Navigation */}
            {versions.length > 1 && (
              <div className="p-4 border-b border-slate-200/50 bg-slate-50/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-slate-600 uppercase tracking-wider">Version History</span>
                  <span className="text-sm font-medium text-slate-700">
                    {currentVersionIndex + 1} / {versions.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigateVersion(-1, versions.length)}
                    disabled={!canNavigateLeft}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
                      canNavigateLeft
                        ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 cursor-pointer'
                        : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="text-sm font-medium">Previous</span>
                  </button>
                  <button
                    onClick={() => navigateVersion(1, versions.length)}
                    disabled={!canNavigateRight}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
                      canNavigateRight
                        ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 cursor-pointer'
                        : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <span className="text-sm font-medium">Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                {currentVersion.edit_prompt && (
                  <p className="mt-2 text-xs text-slate-500 italic">
                    "{currentVersion.edit_prompt}"
                  </p>
                )}
              </div>
            )}

            {/* Edit Limit Banner */}
            <div className="p-4 border-b border-slate-200/50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Edits remaining</span>
                <span 
                  className={`font-medium ${editsRemaining <= 2 ? 'text-amber-600' : 'text-slate-700'}`}
                >
                  {editsRemaining} / {image.max_edits}
                </span>
              </div>
              <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all"
                  style={{ 
                    width: `${(editsRemaining / image.max_edits) * 100}%`,
                    backgroundColor: editsRemaining <= 2 ? '#f59e0b' : primaryColor,
                  }}
                />
              </div>
            </div>

            {/* Conversation */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Original prompt */}
              <div className="bg-slate-100 rounded-2xl rounded-tl-sm p-4">
                <p className="text-xs text-slate-500 mb-1 font-medium">Original prompt</p>
                <p className="text-sm text-slate-700">{image.prompt}</p>
              </div>

              {/* Conversation history */}
              {image.conversation?.map((msg, index) => (
                <div
                  key={index}
                  className={`rounded-2xl p-4 ${
                    msg.role === 'user'
                      ? 'bg-slate-900 text-white rounded-br-sm ml-8'
                      : 'bg-slate-100 text-slate-700 rounded-tl-sm mr-8'
                  }`}
                >
                  <p className="text-sm">{msg.content}</p>
                  {msg.image_url && (
                    <img 
                      src={msg.image_url} 
                      alt="Edit result" 
                      className="mt-2 rounded-lg w-full"
                    />
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-slate-200/50">
              {canEdit ? (
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleEdit(); }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="Describe your edit..."
                    disabled={editing || image.status === 'generating'}
                    className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!editPrompt.trim() || editing || image.status === 'generating'}
                    className="px-4 py-3 rounded-xl text-white transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {editing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </button>
                </form>
              ) : (
                <div className="text-center py-2">
                  <p className="text-sm text-slate-500 mb-3">
                    You've reached the edit limit for this image.
                  </p>
                  <button
                    onClick={handleStartNew}
                    className="px-6 py-2 rounded-xl text-white text-sm font-medium transition-all hover:shadow-lg"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Create New Image
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

