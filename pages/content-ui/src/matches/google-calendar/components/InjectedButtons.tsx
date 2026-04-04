import { Button } from '@extension/ui';
import { RefreshCw, Loader2 } from 'lucide-react';
import type { AppState } from '../App';

interface InjectedButtonsProps {
  onOpenPanel: () => void;
  onQuickSync: () => void;
  appState: AppState;
  isSyncing: boolean;
}

export const InjectedButtons = ({ onOpenPanel, onQuickSync, appState, isSyncing }: InjectedButtonsProps) => {
  const isLoading = appState === 'LOADING';
  const canSync = appState === 'READY';

  const statusMessage =
    appState === 'SIGNED_OUT'
      ? 'Sign in to sync'
      : appState === 'NEEDS_ICS'
        ? 'Add ICS URL'
        : appState === 'LOADING'
          ? 'Loading...'
          : null;

  return (
    <div className="c2c-toolbar-group">
      {/* Main Extension Button */}
      <Button onClick={onOpenPanel} variant="outline" disabled={isLoading} className="c2c-main-button">
        <svg
          className="c2c-logo-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="c2c-label">class2calendar</span>
      </Button>

      {/* Quick Sync Button */}
      <Button
        onClick={onQuickSync}
        variant="outline"
        size="icon"
        disabled={!canSync || isLoading || isSyncing}
        className="c2c-sync-button">
        {isSyncing ? <Loader2 className="c2c-sync-icon c2c-spin" /> : <RefreshCw className="c2c-sync-icon" />}
      </Button>

      {/* Inline status message (only when not ready) */}
      {statusMessage && <span className="c2c-status-text">{statusMessage}</span>}
    </div>
  );
};
