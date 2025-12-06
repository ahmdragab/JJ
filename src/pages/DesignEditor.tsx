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
    <div className="min-h-screen bg-slate-50">
      <nav className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>
          <div className="text-slate-900 font-semibold">
            Design Editor
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onExport('html')}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              HTML
            </button>
            <button
              onClick={() => onExport('png')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
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
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <TemplateRenderer
                template={template}
                design={design}
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                Content
              </h2>
              <div className="space-y-4">
                {Object.entries(template.slots).map(([key, slot]) => {
                  if (slot.type !== 'text') return null;

                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-slate-700 capitalize">
                          {key.replace('_', ' ')}
                        </label>
                        <button
                          onClick={() => handleEditSlot(key)}
                          className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          <Edit3 className="w-3 h-3" />
                          Edit
                        </button>
                      </div>
                      {editingSlot === key ? (
                        <div>
                          <textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none"
                            rows={3}
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={handleSaveSlot}
                              className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingSlot(null)}
                              className="flex-1 px-3 py-1.5 border border-slate-300 text-slate-700 text-sm rounded hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">
                          {design.slots[key] || 'Not set'}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                Regenerate
              </h2>
              <div className="space-y-3">
                <button
                  onClick={onRegenerateCopy}
                  className="w-full px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Regenerate Copy
                </button>
                <button
                  onClick={onRegenerateImage}
                  className="w-full px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Regenerate Image
                </button>
              </div>
            </div>

            <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-2">
                Template: {template.name}
              </h3>
              <p className="text-sm text-blue-700">
                {template.category} • {template.aspect_ratio}
              </p>
            </div>
          </div>
        </div>
      </div>

      {editingSlot && (
        <div
          className="fixed inset-0 bg-black/20 z-10"
          onClick={() => setEditingSlot(null)}
        />
      )}
    </div>
  );
}
