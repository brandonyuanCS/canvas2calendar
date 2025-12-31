import { InjectedButtons } from './components/InjectedButtons';
import { MainPanel } from './components/MainPanel';
import { TooltipProvider } from '@extension/ui';
import { useState, useEffect } from 'react';

export type AppState = 'LOADING' | 'SIGNED_OUT' | 'NEEDS_ICS' | 'READY';

export default function App() {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [appState, setAppState] = useState<AppState>('LOADING');

  useEffect(() => {
    console.log('[C2C] Google Calendar content UI loaded');

    // Check initial auth state
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      // Check for existing auth token
      const result = await chrome.storage.local.get(['google_access_token', 'ics_url']);

      if (!result.google_access_token) {
        setAppState('SIGNED_OUT');
        return;
      }

      if (!result.ics_url) {
        setAppState('NEEDS_ICS');
        return;
      }

      setAppState('READY');
    } catch (error) {
      console.error('[C2C] Error checking auth state:', error);
      setAppState('SIGNED_OUT');
    }
  };

  const handleOpenPanel = () => {
    setIsPanelOpen(true);
  };

  const handleClosePanel = () => {
    setIsPanelOpen(false);
  };

  const handleQuickSync = async () => {
    // Quick sync logic - will be implemented
    console.log('[C2C] Quick sync triggered');
  };

  const handleStateChange = (newState: AppState) => {
    setAppState(newState);
  };

  return (
    <TooltipProvider>
      {/* Bottom-left buttons */}
      <InjectedButtons onOpenPanel={handleOpenPanel} onQuickSync={handleQuickSync} appState={appState} />

      {/* Main popup panel */}
      <MainPanel
        isOpen={isPanelOpen}
        onClose={handleClosePanel}
        appState={appState}
        onStateChange={handleStateChange}
      />
    </TooltipProvider>
  );
}
