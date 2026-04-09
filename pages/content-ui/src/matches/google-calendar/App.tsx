import { InjectedButtons } from './components/InjectedButtons';
import { MainPanel } from './components/MainPanel';
import { sync } from '@extension/shared';
import { TooltipProvider } from '@extension/ui';
import { useState, useEffect } from 'react';

export type AppState = 'LOADING' | 'SIGNED_OUT' | 'NEEDS_ICS' | 'READY';

export interface UserData {
  name?: string;
  email?: string;
  picture?: string;
}

export default function App() {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [appState, setAppState] = useState<AppState>('LOADING');
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    console.log('[C2C] Google Calendar content UI loaded');
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      // get all status info from background via message
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

      // Fetch user data for profile display
      const userResponse = await chrome.runtime.sendMessage({ type: 'GET_USER' });
      if (userResponse.success && userResponse.data) {
        setUserData({
          name: userResponse.data.name,
          email: userResponse.data.email,
          picture: userResponse.data.picture,
        });
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
    if (isSyncing || appState !== 'READY') return;
    setIsSyncing(true);
    try {
      console.log('[C2C] Quick sync triggered');
      const result = await sync.performSync();
      if (result.success) {
        console.log('[C2C] Sync complete:', result.report);
      } else {
        console.error('[C2C] Sync failed:', result.error);
      }
    } catch (error) {
      console.error('[C2C] Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
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
      {/* Top-center toolbar buttons */}
      <InjectedButtons
        onOpenPanel={handleOpenPanel}
        onQuickSync={handleQuickSync}
        appState={appState}
        isSyncing={isSyncing}
      />

      {/* Main popup panel */}
      <MainPanel
        isOpen={isPanelOpen}
        onClose={handleClosePanel}
        appState={appState}
        onStateChange={handleStateChange}
        userData={userData}
        onSignOut={() => {
          setUserData(null);
          setAppState('SIGNED_OUT');
        }}
      />
    </TooltipProvider>
  );
}
