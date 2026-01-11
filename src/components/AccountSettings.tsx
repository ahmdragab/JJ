import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Modal } from './ui';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface AccountSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccountSettings({ isOpen, onClose }: AccountSettingsProps) {
  const { user } = useAuth();
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleManageSubscription = async () => {
    if (!user) return;

    setIsLoadingPortal(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-portal-session`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create portal session');
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoadingPortal(false);
    }
  };

  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || 'User';
  const userEmail = user?.email || '';

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <div className="p-6">
        <h2 className="text-xl font-semibold text-neutral-800">Account Settings</h2>
        <p className="text-sm text-neutral-500 mt-1">Manage your account information</p>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Account Information */}
        <div className="mt-6">
          <h3 className="text-sm font-medium text-[#3531B7]">Account Information</h3>
          <div className="mt-3 space-y-3">
            <div>
              <label className="text-xs text-neutral-500">Name</label>
              <p className="text-sm text-neutral-800 mt-0.5">{userName}</p>
            </div>
            <div>
              <label className="text-xs text-neutral-500">Email</label>
              <p className="text-sm text-neutral-800 mt-0.5">{userEmail}</p>
            </div>
          </div>
        </div>

        {/* Subscription Management */}
        <div className="mt-6 pt-6 border-t border-neutral-100">
          <h3 className="text-sm font-medium text-[#3531B7]">Subscription</h3>
          <p className="text-xs text-neutral-500 mt-1">
            Manage your subscription, billing, and payment methods
          </p>
          <button
            onClick={handleManageSubscription}
            disabled={isLoadingPortal}
            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-neutral-700 transition-colors"
          >
            {isLoadingPortal ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <ExternalLink className="w-4 h-4" />
                Manage Subscription
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
