import { AuthPrompt } from './AuthPrompt';
import { IcsUrlInput } from './IcsUrlInput';
import { SettingsPanel } from './SettingsPanel';
import { Button } from '@extension/ui';
import { X } from 'lucide-react';
import type { AppState } from '../App';

interface MainPanelProps {
  isOpen: boolean;
  onClose: () => void;
  appState: AppState;
  onStateChange: (state: AppState) => void;
}

export const MainPanel = ({ isOpen, onClose, appState, onStateChange }: MainPanelProps) => {
  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
      tabIndex={-1}>
      {/* Backdrop with blur and dim */}
      <div className="animate-in fade-in-0 absolute inset-0 bg-black/50 backdrop-blur-sm duration-200" />

      {/* Panel */}
      <div
        className="bg-background border-border animate-in fade-in-0 zoom-in-95 relative flex flex-col overflow-hidden rounded-xl border shadow-2xl duration-200"
        style={{
          width: 'calc(100vw - 4rem)',
          height: 'calc(100vh - 4rem)',
          maxWidth: '1400px',
          maxHeight: '900px',
        }}>
        {/* Header */}
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary flex h-8 w-8 items-center justify-center rounded-lg">
              <span className="text-primary-foreground text-sm font-bold">C2C</span>
            </div>
            <div>
              <h1 className="text-foreground text-lg font-semibold">Class2Calendar</h1>
              <p className="text-muted-foreground text-sm">Sync your Canvas calendar to Google</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {appState === 'LOADING' && (
            <div className="flex h-full items-center justify-center">
              <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
            </div>
          )}

          {appState === 'SIGNED_OUT' && <AuthPrompt onSuccess={() => onStateChange('NEEDS_ICS')} />}

          {appState === 'NEEDS_ICS' && <IcsUrlInput onSuccess={() => onStateChange('READY')} />}

          {appState === 'READY' && <SettingsPanel />}
        </div>
      </div>
    </div>
  );
};
