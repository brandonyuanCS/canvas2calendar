import { auth, calendar, user, sync } from '@extension/shared';
import { useEffect, useState } from 'react';
import type { ApiSyncReport } from '@extension/shared';
import './Popup.css';

type ApiSyncResponse = {
  success: boolean;
  report?: ApiSyncReport;
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
    const init = async () => {
      try {
        // Check if we have a user session by fetching preferences/user info
        const result = await user.getPreferences();
        if (result.success && result.preferences) {
          // We are authenticated
          setIsAuthenticated(true);

          // Try to get email for display (we might need a new endpoint for this, or extract from user data if we had it)
          // For now, let's try to get it from storage if we cached it, or just generic "Signed In"
          chrome.storage.local.get(['userEmail'], local => {
            if (local.userEmail) setUserEmail(local.userEmail);
          });

          checkSetupStatus();
        }
      } catch {
        // Not authenticated or error
        setIsAuthenticated(false);
      }
    };

    init();

    // Load debug logs
    chrome.storage.local.get(['debugLogs'], result => {
      if (result.debugLogs) {
        setDebugLogs(result.debugLogs as DebugLog[]);
      }
    });
  }, []);

  // Check if calendar exists and ICS URL is set
  const checkSetupStatus = async () => {
    try {
      // Check for calendar
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

  // OAuth flow - using new Chrome Identity API
  const handleLogin = async () => {
    try {
      setLoading(true);
      setError('');
      addDebugLog('info', 'Starting OAuth flow...');

      const userInfo = await auth.signIn();
      addDebugLog('success', `Logged in as: ${userInfo.email}`);

      setUserEmail(userInfo.email);
      setIsAuthenticated(true);

      // Persist email for UI display next time
      chrome.storage.local.set({ userEmail: userInfo.email });

      checkSetupStatus();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start OAuth';
      addDebugLog('error', `OAuth failed: ${errorMessage}`);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      chrome.storage.local.remove(['userEmail']);
      setUserEmail('');
      setIsAuthenticated(false);
      setHasCalendar(false);
      setIcsUrl('');
      setIcsUrlInput('');
      setSyncReport(null);
    } catch (err) {
      console.error('Logout failed:', err);
    }
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
      <div className="popup-container">
        <div className="popup-header">
          <h1 className="popup-title">Canvas2Calendar</h1>
          <p className="popup-subtitle">Sync Canvas assignments to Google Calendar & Tasks</p>
        </div>

        <div className="popup-content">
          <button onClick={handleLogin} disabled={loading} className="btn btn-primary btn-block">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {loading ? 'Connecting...' : 'Sign in with Google'}
          </button>

          {error && (
            <div className="alert alert-error">
              <span className="text-sm">{error}</span>
            </div>
          )}

          <div className="popup-footer">
            <button
              onClick={() => setShowDebugLogs(!showDebugLogs)}
              className="btn btn-ghost btn-sm text-muted text-xs">
              {showDebugLogs ? 'Hide' : 'Show'} Debug Logs
            </button>
          </div>

          {showDebugLogs && (
            <div className="debug-panel">
              <div className="debug-header">
                <span className="text-xs font-semibold">Debug Logs</span>
                <button
                  onClick={() => {
                    setDebugLogs([]);
                    chrome.storage.local.remove('debugLogs');
                  }}
                  className="btn btn-ghost btn-sm text-xs">
                  Clear
                </button>
              </div>
              <div className="debug-logs">
                {debugLogs.length === 0 ? (
                  <p className="text-muted text-xs">No logs yet</p>
                ) : (
                  debugLogs.map((log, i) => (
                    <div key={i} className={`debug-log debug-log-${log.level}`}>
                      <span className="debug-time">{log.timestamp}</span>
                      <span className="debug-level">{log.level.toUpperCase()}</span>
                      <span className="debug-message">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render main interface
  return (
    <div className="popup-container">
      {/* Header */}
      <div className="popup-header">
        <div>
          <h1 className="popup-title">Canvas2Calendar</h1>
          <p className="popup-subtitle">{userEmail}</p>
        </div>
        <div className="popup-actions">
          <button onClick={() => setShowDebugLogs(!showDebugLogs)} className="btn btn-secondary btn-sm">
            <span className="text-xs">{showDebugLogs ? 'Hide' : 'Show'} Debug Logs</span>
          </button>
          <button onClick={handleLogout} className="btn btn-secondary btn-sm">
            <span className="text-xs">Sign out</span>
          </button>
        </div>
      </div>

      <div className="popup-content">
        {/* Debug Logs */}
        {showDebugLogs && (
          <div className="debug-panel">
            <div className="debug-header">
              <span className="text-xs font-semibold">Debug Logs</span>
              <button
                onClick={() => {
                  setDebugLogs([]);
                  chrome.storage.local.remove('debugLogs');
                }}
                className="btn btn-ghost btn-sm text-xs">
                Clear
              </button>
            </div>
            <div className="debug-logs">
              {debugLogs.length === 0 ? (
                <p className="text-muted text-xs">No logs yet</p>
              ) : (
                debugLogs.map((log, i) => (
                  <div key={i} className={`debug-log debug-log-${log.level}`}>
                    <span className="debug-time">{log.timestamp}</span>
                    <span className="debug-level">{log.level.toUpperCase()}</span>
                    <span className="debug-message">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="alert alert-error">
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Calendar Setup */}
        {!hasCalendar && (
          <div className="setup-card">
            <div className="setup-card-content">
              <div className="setup-icon">📅</div>
              <div>
                <h3 className="setup-title">Calendar Setup</h3>
                <p className="setup-description">Create a calendar to sync your Canvas events</p>
              </div>
            </div>
            <button onClick={handleCreateCalendar} disabled={loading} className="btn btn-primary btn-sm">
              {loading ? 'Creating...' : 'Create Calendar'}
            </button>
          </div>
        )}

        {/* ICS URL Section */}
        {hasCalendar && (
          <div className="section">
            <div className="section-header">
              <h3 className="section-title">Canvas Feed</h3>
              <p className="section-description">Canvas → Calendar → Calendar Feed → Copy & paste URL here</p>
            </div>

            <div className="input-group" style={{ display: 'flex', alignItems: 'stretch' }}>
              <input
                type="text"
                value={icsUrlInput}
                onChange={e => setIcsUrlInput(e.target.value)}
                placeholder="https://canvas.example.edu/feeds/..."
                className="text-xs"
                style={{
                  fontSize: '0.75rem',
                  padding: '0.5rem 0.75rem',
                  flex: 1,
                }}
              />
              <button
                onClick={handleSaveIcsUrl}
                disabled={loading || !icsUrlInput || icsUrlInput === icsUrl}
                className={`btn btn-sm ${icsUrlInput && icsUrlInput !== icsUrl ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  whiteSpace: 'nowrap',
                  padding: '0.5rem 0.75rem',
                }}>
                {loading ? 'Saving...' : icsUrl ? 'Update URL' : 'Save URL'}
              </button>
            </div>

            {icsUrl && (
              <div className="status-badge status-badge-small">
                <span className="status-dot status-dot-success"></span>
                <span className="text-xs">Feed configured</span>
              </div>
            )}
          </div>
        )}

        {/* Preferences Link */}

        {/* Sync Section */}
        {hasCalendar && icsUrl && (
          <div className="section">
            <div className="section-header">
              <h3 className="section-title">Sync</h3>
            </div>

            {hasCalendar && icsUrl && (
              <button onClick={() => chrome.runtime.openOptionsPage()} className="preference-card">
                <div>
                  <div className="preference-title">Calendar & Tasks Preferences</div>
                  <div className="preference-description">Configure sync settings</div>
                </div>
                <span className="preference-arrow">→</span>
              </button>
            )}

            <button onClick={handleSync} disabled={loading} className="btn btn-primary btn-block">
              {loading ? (
                <>
                  <span className="loading"></span>
                  <span>Syncing...</span>
                </>
              ) : (
                'Sync Now'
              )}
            </button>

            {syncReport && (
              <div className="sync-report">
                <div className="sync-report-header">
                  <span className="text-xs font-medium">Last Sync</span>
                  <span className="text-muted text-xs">
                    {new Date(syncReport.report?.metadata.sync_completed_at || '').toLocaleTimeString()}
                  </span>
                </div>

                <div className="sync-stats">
                  <div className="sync-stat">
                    <span className="sync-stat-label">Parsed</span>
                    <span className="sync-stat-value">{syncReport.report?.metadata.total_events_parsed}</span>
                  </div>
                  <div className="sync-stat">
                    <span className="sync-stat-label">Calendar</span>
                    <span className="sync-stat-value text-accent">
                      {syncReport.report?.metadata.events_to_calendar}
                    </span>
                  </div>
                  <div className="sync-stat">
                    <span className="sync-stat-label">Tasks</span>
                    <span className="sync-stat-value" style={{ color: 'var(--color-success)' }}>
                      {syncReport.report?.metadata.events_to_tasks}
                    </span>
                  </div>
                </div>

                <div className="sync-details">
                  <div className="sync-detail-group">
                    <span className="sync-detail-title">Calendar</span>
                    <div className="sync-detail-counts">
                      <span className="sync-detail-count" style={{ color: 'var(--color-success)' }}>
                        +{syncReport.report?.calendar.details?.created?.length ?? 0}
                      </span>
                      <span className="sync-detail-count" style={{ color: 'var(--color-accent)' }}>
                        ~{syncReport.report?.calendar.details?.updated?.length ?? 0}
                      </span>
                      <span className="sync-detail-count" style={{ color: 'var(--color-error)' }}>
                        -{syncReport.report?.calendar.details?.deleted?.length ?? 0}
                      </span>
                      <span className="sync-detail-count text-muted">
                        ={syncReport.report?.calendar.details?.unchanged?.length ?? 0}
                      </span>
                    </div>
                  </div>

                  <div className="sync-detail-group">
                    <span className="sync-detail-title">Tasks</span>
                    <div className="sync-detail-counts">
                      <span className="sync-detail-count" style={{ color: 'var(--color-success)' }}>
                        +{syncReport.report?.tasks.details?.tasks?.created?.length ?? 0}
                      </span>
                      <span className="sync-detail-count" style={{ color: 'var(--color-accent)' }}>
                        ~{syncReport.report?.tasks.details?.tasks?.updated?.length ?? 0}
                      </span>
                      <span className="sync-detail-count" style={{ color: 'var(--color-error)' }}>
                        -{syncReport.report?.tasks.details?.tasks?.deleted?.length ?? 0}
                      </span>
                      <span className="sync-detail-count text-muted">
                        ={syncReport.report?.tasks.details?.tasks?.unchanged?.length ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
