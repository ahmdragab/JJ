import { useState } from 'react';
import { ArrowLeft, Download, RefreshCw, Edit3 } from 'lucide-react';
import { Design, Template } from '../lib/supabase';
import { TemplateRenderer } from '../components/TemplateRenderer';

export function DesignEditor({
  design,
  template,
  onBack,
  onRegenerateImage,
  onRegenerateCopy,
  onUpdateSlot,
  onExport,
}: {
  design: Design;
  template: Template;
  onBack: () => void;
  onRegenerateImage: () => void;
  onRegenerateCopy: () => void;
  onUpdateSlot: (slotKey: string, value: string) => void;
  onExport: (format: 'png' | 'html') => void;
}) {
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleEditSlot = (slotKey: string) => {
    setEditingSlot(slotKey);
    setEditValue(design.slots[slotKey] || '');
  };

  const handleSaveSlot = () => {
    if (editingSlot) {
      onUpdateSlot(editingSlot, editValue);
      setEditingSlot(null);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <nav className="border-b border-neutral-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-neutral-600 hover:text-neutral-800 transition-colors min-h-[44px]"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>
          <div className="text-neutral-800 font-semibold font-heading">
            Design Editor
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onExport('html')}
              className="btn-ghost px-4 py-2.5 border border-neutral-200 rounded-xl hover:bg-neutral-100 transition-colors flex items-center gap-2 min-h-[44px]"
            >
              <Download className="w-4 h-4" />
              HTML
            </button>
            <button
              onClick={() => onExport('png')}
              className="btn-primary px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2 min-h-[44px]"
            >
              <Download className="w-4 h-4" />
              PNG
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm">
              <TemplateRenderer
                template={template}
                design={design}
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-neutral-800 mb-4 font-heading">
                Content
              </h2>
              <div className="space-y-4">
                {template.slots && Object.entries(template.slots).map(([key, slot]) => {
                  if (slot.type !== 'text') return null;

                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-neutral-700 capitalize">
                          {key.replace('_', ' ')}
                        </label>
                        <button
                          onClick={() => handleEditSlot(key)}
                          className="text-sm text-brand-primary hover:text-brand-primary-hover flex items-center gap-1 transition-colors min-h-[44px] px-2"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                      </div>
                      {editingSlot === key ? (
                        <div>
                          <textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="input w-full px-3 py-2 text-sm resize-none"
                            rows={3}
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={handleSaveSlot}
                              className="btn-primary flex-1 px-3 py-2 text-sm rounded-xl min-h-[40px]"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingSlot(null)}
                              className="btn-ghost flex-1 px-3 py-2 border border-neutral-200 text-sm rounded-xl min-h-[40px]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-neutral-600 bg-neutral-50 px-3 py-2 rounded-xl">
                          {design.slots[key] || 'Not set'}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card p-6">
              <h2 className="text-lg font-semibold text-neutral-800 mb-4 font-heading">
                Regenerate
              </h2>
              <div className="space-y-3">
                <button
                  onClick={onRegenerateCopy}
                  className="w-full btn-ghost px-4 py-3 border border-neutral-200 rounded-xl hover:bg-neutral-100 transition-colors flex items-center justify-center gap-2 min-h-[48px]"
                >
                  <RefreshCw className="w-4 h-4" />
                  Regenerate Copy
                </button>
                <button
                  onClick={onRegenerateImage}
                  className="w-full btn-ghost px-4 py-3 border border-neutral-200 rounded-xl hover:bg-neutral-100 transition-colors flex items-center justify-center gap-2 min-h-[48px]"
                >
                  <RefreshCw className="w-4 h-4" />
                  Regenerate Image
                </button>
              </div>
            </div>

            <div className="bg-brand-primary/5 rounded-2xl p-6 border border-brand-primary/10">
              <h3 className="font-semibold text-neutral-800 mb-2 font-heading">
                Template: {template.name}
              </h3>
              <p className="text-sm text-neutral-600">
                {template.category} • {template.aspect_ratio}
              </p>
            </div>
          </div>
        </div>
      </div>

      {editingSlot && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-10"
          onClick={() => setEditingSlot(null)}
        />
      )}
    </div>
  );
}
