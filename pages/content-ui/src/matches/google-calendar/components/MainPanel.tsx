import { AuthPrompt } from './AuthPrompt';
import { IcsUrlInput } from './IcsUrlInput';
import { SettingsPanel } from './SettingsPanel';
import { Button } from '@extension/ui';
import { X } from 'lucide-react';
import type { AppState } from '../App';
import type { SubscriptionData } from './TrialBanner';

interface MainPanelProps {
  isOpen: boolean;
  onClose: () => void;
  appState: AppState;
  onStateChange: (state: AppState) => void;
  subscriptionData: SubscriptionData;
}

export const MainPanel = ({ isOpen, onClose, appState, onStateChange, subscriptionData }: MainPanelProps) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if clicking directly on the backdrop, not its children
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop - Higher z-index to cover everything */}
      <div
        className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Dialog Content - Even higher z-index */}
      <div
        className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
        onClick={handleBackdropClick}
        role="button"
        tabIndex={-1}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose();
        }}>
        <div className="bg-background relative flex h-[calc(100vh-4rem)] max-h-[900px] w-[calc(100vw-4rem)] max-w-[1400px] flex-col overflow-hidden rounded-lg border shadow-lg">
          {/* Close Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute right-4 top-4 z-10 h-8 w-8 rounded-sm opacity-70 transition-opacity hover:opacity-100">
            <X className="h-4 w-4" />
          </Button>

          {/* Header */}
          <div className="flex-shrink-0 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary flex h-8 w-8 items-center justify-center rounded-lg">
                <span className="text-primary-foreground text-sm font-bold">C2C</span>
              </div>
              <div>
                <h1 className="text-lg font-semibold">Class2Calendar</h1>
                <p className="text-muted-foreground text-sm">Sync your Canvas calendar to Google</p>
              </div>
            </div>
          </div>

          {/* Separator */}
          <div className="bg-border h-px w-full" />

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            {appState === 'LOADING' && (
              <div className="flex h-full items-center justify-center">
                <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
              </div>
            )}

            {appState === 'SIGNED_OUT' && <AuthPrompt onSuccess={() => onStateChange('NEEDS_ICS')} />}

            {appState === 'NEEDS_ICS' && <IcsUrlInput onSuccess={() => onStateChange('READY')} />}

            {appState === 'READY' && <SettingsPanel subscriptionData={subscriptionData} />}
          </div>
        </div>
      </div>
    </>
  );
};
