import { X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: string;
  variant?: 'danger' | 'default';
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmColor,
  variant = 'default',
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const defaultConfirmColor = variant === 'danger' ? '#dc2626' : '#1a1a1a';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Minimal backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      
      {/* Sleek minimal modal */}
      <div 
        className="relative bg-white/95 backdrop-blur-xl rounded-xl sm:rounded-2xl shadow-2xl max-w-sm w-full p-4 sm:p-6 border border-slate-200/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 w-6 h-6 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content - minimal */}
        <div className="pr-8 sm:pr-10">
          <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-1.5">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 mb-4 sm:mb-6">
            {message}
          </p>
        </div>

        {/* Actions - minimal buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors rounded-lg"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="flex-1 sm:flex-none px-4 py-2.5 text-sm rounded-lg text-white font-medium transition-all hover:opacity-90"
            style={{ backgroundColor: confirmColor || defaultConfirmColor }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

