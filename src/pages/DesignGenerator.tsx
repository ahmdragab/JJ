import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { Brand, Template, supabase } from '../lib/supabase';

export function DesignGenerator({
  brand: _brand,
  onGenerate,
  onBack,
}: {
  brand: Brand;
  onGenerate: (templateId: string, brief: string) => void;
  onBack: () => void;
}) {
  void _brand; // Available for future brand-specific template filtering
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [brief, setBrief] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedTemplate) return;

    setGenerating(true);
    try {
      await onGenerate(selectedTemplate, brief);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <nav className="border-b border-neutral-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Brand Kit
          </button>
          <div className="flex items-center gap-2 text-neutral-900 font-semibold">
            <Sparkles className="w-5 h-5" />
            Generate Design
          </div>
          <div className="w-24" />
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">Choose a Template</h1>
          <p className="text-neutral-600">
            Select a template and provide a brief for AI-generated content
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template.id)}
                  className={`bg-white rounded-xl p-6 border-2 transition-all text-left ${
                    selectedTemplate === template.id
                      ? 'border-emerald-500 shadow-lg'
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg mb-4 flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-neutral-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-neutral-900 mb-1">
                    {template.name}
                  </h3>
                  <p className="text-sm text-neutral-600 mb-2">{template.category}</p>
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <span className="px-2 py-1 bg-neutral-100 rounded">
                      {template.aspect_ratio}
                    </span>
                    {template.type && (
                      <span className="px-2 py-1 bg-neutral-100 rounded capitalize">
                        {template.type.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {selectedTemplate && (
              <div className="bg-white rounded-xl p-6 border border-neutral-200">
                <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                  Design Brief
                </h2>
                <textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="Describe what you want to promote or communicate (e.g., 'Announce new AI analytics feature for small businesses')"
                  className="w-full px-4 py-3 border border-neutral-300 rounded-lg resize-none h-32 mb-4"
                />
                <button
                  onClick={handleGenerate}
                  disabled={generating || !brief.trim()}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-semibold rounded-lg hover:shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Generating Design...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Generate Design
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
