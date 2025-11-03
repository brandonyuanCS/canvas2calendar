import { auth, calendar, user, sync } from '@extension/shared';
import { useEffect, useState } from 'react';
import type { CentralSyncReport } from '@extension/shared';
import './Popup.css';

type ApiSyncResponse = {
  success: boolean;
  report?: CentralSyncReport;
  error?: string;
};

interface DebugLog {
  timestamp: string;
  level: 'info' | 'error' | 'success';
  message: string;
}

export default function Popup() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [icsUrl, setIcsUrl] = useState<string>('');
  const [icsUrlInput, setIcsUrlInput] = useState<string>('');
  const [hasCalendar, setHasCalendar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [syncReport, setSyncReport] = useState<ApiSyncResponse | null>(null);
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const [showDebugLogs, setShowDebugLogs] = useState(false);

  // Debug logging helper
  const addDebugLog = (level: DebugLog['level'], message: string) => {
    const log: DebugLog = {
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
    };
    setDebugLogs(prev => [...prev.slice(-19), log]); // Keep last 20 logs
    console.log(`[${level.toUpperCase()}]`, message);

    // Also store in chrome.storage for persistence
    chrome.storage.local.get(['debugLogs'], result => {
      const existingLogs = (result.debugLogs as DebugLog[]) || [];
      const updatedLogs = [...existingLogs.slice(-19), log];
      chrome.storage.local.set({ debugLogs: updatedLogs });
    });
  };

  // Load auth state and debug logs from chrome.storage on mount
  useEffect(() => {
    chrome.storage.local.get(['token', 'userEmail', 'debugLogs'], result => {
      if (result.token) {
        setUserEmail(result.userEmail || '');
        setIsAuthenticated(true);
        checkSetupStatus();
      }

      // Load debug logs
      if (result.debugLogs) {
        setDebugLogs(result.debugLogs as DebugLog[]);
      }
    });
  }, []);

  // Check if calendar exists and ICS URL is set
  const checkSetupStatus = async () => {
    try {
      // Check calendar
      const hasCalendarResult = await calendar.checkExists();
      setHasCalendar(hasCalendarResult);

      // Check ICS URL
      const icsData = await user.getIcsUrl();
      if (icsData?.ics_url) {
        setIcsUrl(icsData.ics_url);
        setIcsUrlInput(icsData.ics_url);
      }
    } catch (err) {
      console.error('Error checking setup status:', err);
    }
  };

  // OAuth flow - simple tab polling approach
  const handleLogin = async () => {
    try {
      setLoading(true);
      setError('');
      addDebugLog('info', 'Starting OAuth flow...');

      // Get auth URL
      addDebugLog('info', 'Fetching auth URL from backend...');
      const { authUrl } = await auth.getGoogleAuthUrl();
      addDebugLog('success', `Auth URL received`);

      // Open OAuth in new window
      addDebugLog('info', 'Opening OAuth window...');
      chrome.windows.create(
        {
          url: authUrl,
          type: 'popup',
          width: 500,
          height: 600,
        },
        oauthWindow => {
          if (!oauthWindow || !oauthWindow.id) {
            addDebugLog('error', 'Failed to create OAuth window');
            setError('Failed to open OAuth window');
            setLoading(false);
            return;
          }

          const windowId = oauthWindow.id;
          addDebugLog('info', `OAuth window opened: ${windowId}`);

          // Poll the window's tabs for the callback URL
          const pollInterval = setInterval(() => {
            chrome.windows.get(windowId, { populate: true }, win => {
              // Check if window was closed by user
              if (chrome.runtime.lastError || !win) {
                clearInterval(pollInterval);
                addDebugLog('info', 'OAuth window closed by user');
                setLoading(false);
                return;
              }

              // Check all tabs in the window for callback URL
              const tabs = win.tabs || [];
              for (const tab of tabs) {
                if (!tab.url) continue;

                // Check if this is the callback URL
                if (tab.url.includes('/auth/callback')) {
                  addDebugLog('success', 'Callback URL detected!');
                  clearInterval(pollInterval);

                  try {
                    const url = new URL(tab.url);

                    // First try to read token from the URL fragment (set by success HTML)
                    const hash = url.hash || '';
                    const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
                    const jwt = params.get('jwt');
                    const emailFromHash = params.get('email');

                    if (jwt) {
                      addDebugLog('success', 'JWT token found in URL fragment!');
                      chrome.storage.local.set({ token: jwt, userEmail: emailFromHash || '' }, () => {
                        addDebugLog('success', `Logged in as: ${emailFromHash || ''}`);
                        setUserEmail(emailFromHash || '');
                        setIsAuthenticated(true);
                        setLoading(false);
                        checkSetupStatus();
                        chrome.windows.remove(windowId);
                        addDebugLog('info', '✓ OAuth complete!');
                      });
                      break;
                    }

                    // Check for OAuth error
                    const error = url.searchParams.get('error');
                    if (error) {
                      addDebugLog('error', `OAuth error: ${error}`);
                      setError(`OAuth error: ${error}`);
                      setLoading(false);
                      chrome.windows.remove(windowId);
                      break;
                    }

                    // If no fragment yet, wait for it (the script is setting it)
                    addDebugLog('info', 'Waiting for JWT fragment to be set...');
                    // Don't break here - keep polling until fragment appears
                  } catch {
                    addDebugLog('error', 'Failed to parse callback URL');
                    setError('Failed to parse OAuth callback');
                    setLoading(false);
                    chrome.windows.remove(windowId);
                    break;
                  }
                }
              }
            });
          }, 500); // Poll every 500ms
        },
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start OAuth';
      addDebugLog('error', `OAuth failed: ${errorMessage}`);
      setError(errorMessage);
      setLoading(false);
    }
  };

  const handleLogout = () => {
    chrome.storage.local.remove(['token', 'userEmail'], () => {
      setUserEmail('');
      setIsAuthenticated(false);
      setHasCalendar(false);
      setIcsUrl('');
      setIcsUrlInput('');
      setSyncReport(null);
    });
  };

  // Calendar setup
  const handleCreateCalendar = async () => {
    try {
      setLoading(true);
      setError('');

      await calendar.create('Canvas Sync Calendar', 'Synced from Canvas');

      setHasCalendar(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create calendar');
    } finally {
      setLoading(false);
    }
  };

  // ICS URL management
  const handleSaveIcsUrl = async () => {
    try {
      setLoading(true);
      setError('');

      await user.updateIcsUrl(icsUrlInput);

      setIcsUrl(icsUrlInput);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save ICS URL');
    } finally {
      setLoading(false);
    }
  };

  // Sync
  const handleSync = async () => {
    try {
      setLoading(true);
      setError('');
      setSyncReport(null);

      const result = await sync.performSync();

      setSyncReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setLoading(false);
    }
  };

  // Render auth screen
  if (!isAuthenticated) {
    return (
      <div className="w-[400px] p-6">
        <div className="mb-6 text-center">
          <h1 className="mb-2 text-2xl font-bold text-gray-800">Canvas2Calendar</h1>
          <p className="text-sm text-gray-600">Sync Canvas assignments to Google Calendar & Tasks</p>
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="btn-primary mb-3 flex w-full items-center justify-center gap-2">
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign in with Google
        </button>

        {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}

        {/* Debug Logs on login screen */}
        <div className="mt-4">
          <button
            onClick={() => setShowDebugLogs(!showDebugLogs)}
            className="w-full text-xs text-gray-500 hover:text-gray-700">
            {showDebugLogs ? 'Hide' : 'Show'} Debug Logs
          </button>
        </div>

        {showDebugLogs && (
          <div className="mt-3 rounded-lg border border-gray-300 bg-gray-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Debug Logs</h3>
              <button
                onClick={() => {
                  setDebugLogs([]);
                  chrome.storage.local.remove('debugLogs');
                }}
                className="text-xs text-red-600 hover:text-red-700">
                Clear
              </button>
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto text-xs">
              {debugLogs.length === 0 ? (
                <p className="text-gray-500">No debug logs yet. Try logging in to see activity.</p>
              ) : (
                debugLogs.map((log, i) => (
                  <div
                    key={i}
                    className={`rounded px-2 py-1 font-mono ${
                      log.level === 'error'
                        ? 'bg-red-100 text-red-800'
                        : log.level === 'success'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-700'
                    }`}>
                    <span className="text-gray-500">[{log.timestamp}]</span>{' '}
                    <span className="font-semibold">[{log.level.toUpperCase()}]</span> {log.message}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Render main interface
  return (
    <div className="w-[450px] overflow-y-auto p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Canvas2Calendar</h1>
          <p className="text-xs text-gray-500">{userEmail}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDebugLogs(!showDebugLogs)}
            className="text-xs text-gray-500 hover:text-gray-700">
            {showDebugLogs ? 'Hide' : 'Show'} Debug Logs
          </button>
          <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-gray-700">
            Sign out
          </button>
        </div>
      </div>

      {/* Debug Logs */}
      {showDebugLogs && (
        <div className="mb-4 rounded-lg border border-gray-300 bg-gray-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Debug Logs</h3>
            <button
              onClick={() => {
                setDebugLogs([]);
                chrome.storage.local.remove('debugLogs');
              }}
              className="text-xs text-red-600 hover:text-red-700">
              Clear
            </button>
          </div>
          <div className="max-h-48 space-y-1 overflow-y-auto text-xs">
            {debugLogs.length === 0 ? (
              <p className="text-gray-500">No debug logs yet. Try logging in to see activity.</p>
            ) : (
              debugLogs.map((log, i) => (
                <div
                  key={i}
                  className={`rounded px-2 py-1 font-mono ${
                    log.level === 'error'
                      ? 'bg-red-100 text-red-800'
                      : log.level === 'success'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-700'
                  }`}>
                  <span className="text-gray-500">[{log.timestamp}]</span>{' '}
                  <span className="font-semibold">[{log.level.toUpperCase()}]</span> {log.message}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Calendar Setup */}
      {!hasCalendar && (
        <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 p-4">
          <h3 className="mb-2 font-semibold text-yellow-900">Setup Required</h3>
          <p className="mb-3 text-sm text-yellow-800">Create a calendar to sync your Canvas events.</p>
          <button onClick={handleCreateCalendar} disabled={loading} className="btn-primary">
            Create Calendar
          </button>
        </div>
      )}

      {/* ICS URL Section */}
      {hasCalendar && (
        <div className="mb-4 rounded-lg border bg-white p-4">
          <h3 className="mb-2 font-semibold text-gray-800">Canvas ICS Feed</h3>
          <p className="mb-3 text-xs text-gray-600">
            Get your ICS feed URL from Canvas: Calendar → Calendar Feed → Copy URL
          </p>

          <input
            type="text"
            value={icsUrlInput}
            onChange={e => setIcsUrlInput(e.target.value)}
            placeholder="https://canvas.example.edu/feeds/..."
            className="mb-2 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />

          <button
            onClick={handleSaveIcsUrl}
            disabled={loading || !icsUrlInput || icsUrlInput === icsUrl}
            className="btn-secondary w-full">
            {icsUrl ? 'Update ICS URL' : 'Save ICS URL'}
          </button>

          {icsUrl && <p className="mt-2 text-xs text-green-600">✓ ICS URL configured</p>}
        </div>
      )}

      {/* Preferences */}
      {hasCalendar && icsUrl && (
        <div className="mb-4">
          <button
            onClick={() => chrome.runtime.openOptionsPage()}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-left hover:bg-gray-50">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-800">⚙️ Sync Preferences</span>
              <span className="text-gray-400">→</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">Configure which events sync to calendar or tasks</p>
          </button>
        </div>
      )}

      {/* Sync Section */}
      {hasCalendar && icsUrl && (
        <div className="mb-4 rounded-lg border bg-white p-4">
          <h3 className="mb-3 font-semibold text-gray-800">Sync</h3>

          <button onClick={handleSync} disabled={loading} className="btn-primary mb-3">
            {loading ? 'Syncing...' : '🔄 Sync Now'}
          </button>

          {syncReport && (
            <div className="space-y-2 text-sm">
              <div className="rounded bg-gray-50 p-3">
                <p className="mb-2 font-medium text-gray-700">Last Sync Results:</p>

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total events parsed:</span>
                    <span className="font-medium">{syncReport.report?.metadata.total_events_parsed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">→ Calendar:</span>
                    <span className="font-medium text-blue-600">{syncReport.report?.metadata.events_to_calendar}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">→ Tasks:</span>
                    <span className="font-medium text-green-600">{syncReport.report?.metadata.events_to_tasks}</span>
                  </div>
                </div>

                <div className="mt-3 border-t pt-2">
                  <p className="mb-1 text-xs font-medium text-gray-700">Calendar:</p>
                  <div className="grid grid-cols-4 gap-1 text-xs">
                    <div>
                      <span className="text-green-600">+{syncReport.report?.calendar.created.length}</span>
                    </div>
                    <div>
                      <span className="text-blue-600">~{syncReport.report?.calendar.updated.length}</span>
                    </div>
                    <div>
                      <span className="text-red-600">-{syncReport.report?.calendar.deleted.length}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">={syncReport.report?.calendar.unchanged.length}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-2 border-t pt-2">
                  <p className="mb-1 text-xs font-medium text-gray-700">Tasks:</p>
                  <div className="grid grid-cols-4 gap-1 text-xs">
                    <div>
                      <span className="text-green-600">+{syncReport.report?.tasks.tasks.created.length}</span>
                    </div>
                    <div>
                      <span className="text-blue-600">~{syncReport.report?.tasks.tasks.updated.length}</span>
                    </div>
                    <div>
                      <span className="text-red-600">-{syncReport.report?.tasks.tasks.deleted.length}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">={syncReport.report?.tasks.tasks.unchanged.length}</span>
                    </div>
                  </div>
                </div>

                <p className="mt-2 text-xs text-gray-500">
                  {new Date(syncReport.report?.metadata.sync_completed_at || '').toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
