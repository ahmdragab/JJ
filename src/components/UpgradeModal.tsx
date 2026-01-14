import { X, Sparkles, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui';
import { track } from '../lib/analytics';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCredits: number;
}

export function UpgradeModal({ isOpen, onClose, currentCredits }: UpgradeModalProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleUpgrade = () => {
    track('upgrade_nudge_clicked', { source: 'insufficient_credits_modal', current_credits: currentCredits });
    navigate('/pricing');
    onClose();
  };

  const handleDismiss = () => {
    track('upgrade_nudge_dismissed', { source: 'insufficient_credits_modal', current_credits: currentCredits });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleDismiss}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header gradient */}
        <div className="bg-gradient-to-br from-violet-500 to-purple-600 px-6 py-8 text-white text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Out of Credits</h2>
          <p className="text-white/80">
            You have <span className="font-semibold text-white">{currentCredits}</span> credit{currentCredits !== 1 ? 's' : ''} remaining
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          <p className="text-neutral-600 text-center mb-6">
            Upgrade your plan to keep creating beautiful designs for your brand.
          </p>

          {/* Benefits */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-3 text-sm text-neutral-700">
              <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-violet-600" />
              </div>
              <span>Get more credits every month</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-neutral-700">
              <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-violet-600" />
              </div>
              <span>Priority image generation</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <Button
              onClick={handleUpgrade}
              className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
            >
              View Plans
            </Button>
            <button
              onClick={handleDismiss}
              className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  );
}
