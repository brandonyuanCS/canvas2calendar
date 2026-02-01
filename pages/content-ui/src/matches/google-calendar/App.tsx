import { InjectedButtons } from './components/InjectedButtons';
import { MainPanel } from './components/MainPanel';
import { TooltipProvider } from '@extension/ui';
import { useState, useEffect } from 'react';
import type { SubscriptionData } from './components/TrialBanner';

export type AppState = 'LOADING' | 'SIGNED_OUT' | 'NEEDS_ICS' | 'READY';

export default function App() {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [appState, setAppState] = useState<AppState>('LOADING');
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData>({
    has_access: true,
    tier: 'free',
    is_trial: true,
    is_paid: false,
    trial_days_remaining: 14,
  });

  useEffect(() => {
    console.log('[C2C] Google Calendar content UI loaded');

    // Check initial auth state
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      // Get all status info from background via message (single source of truth)
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });

      if (!response.success) {
        console.error('[C2C] Failed to get status:', response.error);
        setAppState('SIGNED_OUT');
        return;
      }

      const status = response.data;

      // Determine app state based on backend data
      if (!status.isAuthenticated) {
        setAppState('SIGNED_OUT');
        return;
      }

      // Fetch full subscription data
      const subResponse = await chrome.runtime.sendMessage({ type: 'GET_SUBSCRIPTION' });
      if (subResponse.success && subResponse.data) {
        setSubscriptionData(subResponse.data);
      }

      if (!status.hasIcsUrl) {
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
    // Re-check auth state when transitioning to ensure subscription is up to date
    if (newState === 'READY') {
      checkAuthState();
    }
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
        subscriptionData={subscriptionData}
      />
    </TooltipProvider>
  );
}
