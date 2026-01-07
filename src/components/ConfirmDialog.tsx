import { X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
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
  variant = 'default',
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop-enter"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative glass rounded-xl sm:rounded-2xl shadow-2xl max-w-sm w-full p-4 sm:p-6 modal-content-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 sm:top-3 sm:right-3 w-10 h-10 sm:w-9 sm:h-9 rounded-xl hover:bg-neutral-100 flex items-center justify-center text-neutral-400 hover:text-neutral-600 transition-colors touch-manipulation"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="pr-8 sm:pr-10">
          <h3 className="text-base sm:text-lg font-semibold text-neutral-800 mb-1.5 font-heading">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-neutral-500 mb-4 sm:mb-6">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <button
            onClick={onClose}
            className="btn-ghost flex-1 py-2.5 text-sm"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 sm:flex-none py-2.5 text-sm rounded-xl font-medium transition-all ${
              variant === 'danger'
                ? 'btn-danger'
                : 'btn-primary'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

