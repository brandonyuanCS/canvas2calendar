import '@src/Options.css';
// import { t } from '@extension/i18n';
import { user, withErrorBoundary, withSuspense, useStorage } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, ToggleButton } from '@extension/ui';
import { useEffect, useState } from 'react';
import type { SyncPreferences, CanvasEventType, CanvasMetadata } from '@extension/shared';

type TabType = 'user-prefs' | 'extension-options';

const Options = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const [activeTab, setActiveTab] = useState<TabType>('user-prefs');
  const [preferences, setPreferences] = useState<SyncPreferences | null>(null);
  const [metadata, setMetadata] = useState<CanvasMetadata | null>(null);
  const [icsUrl, setIcsUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      // Load preferences
      const prefsResponse = await user.getPreferences();
      setPreferences(prefsResponse.preferences);

      // Load ICS URL
      const icsResponse = await user.getIcsUrl();
      setIcsUrl(icsResponse?.ics_url || null);

      // Load Canvas metadata (if ICS URL exists)
      if (icsResponse?.ics_url) {
        try {
          const metadataResponse = (await user.getCanvasMetadata()) as { success: boolean; metadata: CanvasMetadata };
          if (metadataResponse.success) {
            setMetadata(metadataResponse.metadata);
          }
        } catch (err) {
          console.error('Failed to load Canvas metadata:', err);
          // Don't block if metadata fails
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    if (!preferences) return;

    try {
      setSaving(true);
      setError('');
      setSuccessMessage('');

      await user.updatePreferences(preferences);

      setSuccessMessage('Preferences saved successfully! Changes will apply on next sync.');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const updatePreference = <K extends keyof SyncPreferences>(section: K, updates: Partial<SyncPreferences[K]>) => {
    if (!preferences) return;
    setPreferences({
      ...preferences,
      [section]: {
        ...preferences[section],
        ...updates,
      },
    });
  };

  const toggleCourse = (courseCode: string, section: 'calendar' | 'tasks', include: boolean) => {
    if (!preferences) return;

    const currentIncluded = preferences[section].included_courses;
    const currentExcluded = preferences[section].excluded_courses;

    let newIncluded = [...currentIncluded];
    let newExcluded = [...currentExcluded];

    if (include) {
      // Add to included, remove from excluded
      if (!newIncluded.includes(courseCode)) {
        newIncluded.push(courseCode);
      }
      newExcluded = newExcluded.filter(c => c !== courseCode);
    } else {
      // Add to excluded, remove from included
      if (!newExcluded.includes(courseCode)) {
        newExcluded.push(courseCode);
      }
      newIncluded = newIncluded.filter(c => c !== courseCode);
    }

    updatePreference(section, {
      included_courses: newIncluded,
      excluded_courses: newExcluded,
    });
  };

  const isCourseSynced = (courseCode: string, section: 'calendar' | 'tasks'): boolean | null => {
    if (!preferences) return null;
    const included = preferences[section].included_courses;
    const excluded = preferences[section].excluded_courses;

    if (included.length > 0) {
      return included.includes(courseCode);
    }
    if (excluded.includes(courseCode)) {
      return false;
    }
    return true; // Default: all courses included
  };

  if (loading) {
    return (
      <div className="options-container">
        <div className="loading-state">
          <LoadingSpinner />
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!icsUrl) {
    return (
      <div className="options-container">
        <div className="error-state">
          <h2>Setup Required</h2>
          <p>Please configure your Canvas ICS URL in the extension popup first.</p>
          <button onClick={() => window.close()} className="btn-primary">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('options-container', isLight ? 'light-theme' : 'dark-theme')}>
      {/* Sidebar */}
      <aside className="options-sidebar">
        <div className="sidebar-header">
          <h1>Canvas2Calendar</h1>
          <p className="text-sm">Settings</p>
        </div>

        <nav className="sidebar-nav">
          <button
            className={cn('nav-item', activeTab === 'user-prefs' && 'active')}
            onClick={() => setActiveTab('user-prefs')}>
            <span className="nav-icon">⚙️</span>
            <span>User Preferences</span>
          </button>
          <button
            className={cn('nav-item', activeTab === 'extension-options' && 'active')}
            onClick={() => setActiveTab('extension-options')}>
            <span className="nav-icon">🎨</span>
            <span>Extension Options</span>
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="options-main">
        {error && (
          <div className="alert alert-error">
            <strong>Error:</strong> {error}
          </div>
        )}

        {successMessage && (
          <div className="alert alert-success">
            <strong>✓</strong> {successMessage}
          </div>
        )}

        {/* User Preferences Tab */}
        {activeTab === 'user-prefs' && preferences && (
          <div className="tab-content">
            <h2>Sync Preferences</h2>
            <p className="subtitle">Configure how Canvas events sync to Google Calendar and Tasks</p>

            {/* Auto-Sync Settings */}
            <section className="settings-section">
              <h3>Auto-Sync</h3>
              <div className="setting-item">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={preferences.sync?.auto_sync_enabled || false}
                    onChange={e =>
                      updatePreference('sync', {
                        auto_sync_enabled: e.target.checked,
                      })
                    }
                  />
                  <span>Enable automatic syncing</span>
                </label>
                <p className="setting-description">Automatically sync Canvas events at regular intervals</p>
              </div>

              {preferences.sync?.auto_sync_enabled && (
                <div className="setting-item">
                  <label htmlFor="sync-interval">Sync every (hours):</label>
                  <input
                    id="sync-interval"
                    type="number"
                    min="1"
                    max="24"
                    value={preferences.sync?.auto_sync_interval_hours || 6}
                    onChange={e =>
                      updatePreference('sync', {
                        auto_sync_interval_hours: parseInt(e.target.value) || 6,
                      })
                    }
                    className="input-number"
                  />
                  <p className="setting-description">How often to automatically sync (1-24 hours)</p>
                </div>
              )}
            </section>

            {/* Calendar Settings */}
            <section className="settings-section">
              <h3>Calendar Settings</h3>

              <div className="setting-item">
                <span className="setting-label">Event types to sync to Calendar:</span>
                <div className="checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={preferences.calendar.event_types.includes('assignment')}
                      onChange={e => {
                        const types: CanvasEventType[] = e.target.checked
                          ? [...preferences.calendar.event_types, 'assignment' as CanvasEventType]
                          : preferences.calendar.event_types.filter(t => t !== 'assignment');
                        updatePreference('calendar', { event_types: types });
                      }}
                    />
                    <span>Assignments</span>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={preferences.calendar.event_types.includes('event')}
                      onChange={e => {
                        const types: CanvasEventType[] = e.target.checked
                          ? [...preferences.calendar.event_types, 'event' as CanvasEventType]
                          : preferences.calendar.event_types.filter(t => t !== 'event');
                        updatePreference('calendar', { event_types: types });
                      }}
                    />
                    <span>Events</span>
                  </label>
                </div>
                <p className="setting-description">Select which Canvas event types to sync to Google Calendar</p>
              </div>

              {metadata && metadata.courses.length > 0 && (
                <div className="setting-item">
                  <span className="setting-label">Courses to sync to Calendar:</span>
                  <div className="course-list">
                    {metadata.courses.map(course => {
                      const synced = isCourseSynced(course.code, 'calendar');
                      return (
                        <div key={course.code} className="course-item">
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={synced === true}
                              onChange={e => toggleCourse(course.code, 'calendar', e.target.checked)}
                            />
                            <span className="course-name">{course.code}</span>
                            <span className="course-count">({course.eventCount} events)</span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  <p className="setting-description">Select which courses to include in Calendar sync</p>
                </div>
              )}
            </section>

            {/* Tasks Settings */}
            <section className="settings-section">
              <h3>Tasks Settings</h3>

              <div className="setting-item">
                <span className="setting-label">Event types to sync to Tasks:</span>
                <div className="checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={preferences.tasks.event_types.includes('assignment')}
                      onChange={e => {
                        const types: CanvasEventType[] = e.target.checked
                          ? [...preferences.tasks.event_types, 'assignment' as CanvasEventType]
                          : preferences.tasks.event_types.filter(t => t !== 'assignment');
                        updatePreference('tasks', { event_types: types });
                      }}
                    />
                    <span>Assignments</span>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={preferences.tasks.event_types.includes('event')}
                      onChange={e => {
                        const types: CanvasEventType[] = e.target.checked
                          ? [...preferences.tasks.event_types, 'event' as CanvasEventType]
                          : preferences.tasks.event_types.filter(t => t !== 'event');
                        updatePreference('tasks', { event_types: types });
                      }}
                    />
                    <span>Events</span>
                  </label>
                </div>
                <p className="setting-description">Select which Canvas event types to sync to Google Tasks</p>
              </div>

              {metadata && metadata.courses.length > 0 && (
                <div className="setting-item">
                  <span className="setting-label">Courses to sync to Tasks:</span>
                  <div className="course-list">
                    {metadata.courses.map(course => {
                      const synced = isCourseSynced(course.code, 'tasks');
                      return (
                        <div key={course.code} className="course-item">
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={synced === true}
                              onChange={e => toggleCourse(course.code, 'tasks', e.target.checked)}
                            />
                            <span className="course-name">{course.code}</span>
                            <span className="course-count">({course.eventCount} events)</span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  <p className="setting-description">Select which courses to include in Tasks sync</p>
                </div>
              )}

              <div className="setting-item">
                <label htmlFor="task-organization">Task organization:</label>
                <select
                  id="task-organization"
                  value={preferences.tasks.task_organization}
                  onChange={e =>
                    updatePreference('tasks', {
                      task_organization: e.target.value as 'per_course' | 'consolidated',
                    })
                  }
                  className="input-select">
                  <option value="per_course">Separate list per course</option>
                  <option value="consolidated">Single consolidated list</option>
                </select>
                <p className="setting-description">How to organize tasks in Google Tasks</p>
              </div>

              <div className="setting-item">
                <label htmlFor="task-naming">Task list naming:</label>
                <select
                  id="task-naming"
                  value={preferences.tasks.task_list_naming}
                  onChange={e =>
                    updatePreference('tasks', {
                      task_list_naming: e.target.value as 'code' | 'name' | 'combined',
                    })
                  }
                  className="input-select">
                  <option value="code">Course code (e.g., "CS101")</option>
                  <option value="name">Course name (e.g., "Intro to CS")</option>
                  <option value="combined">Combined (e.g., "CS101: Intro to CS")</option>
                </select>
                <p className="setting-description">How to name task lists in Google Tasks</p>
              </div>
            </section>

            {/* Save Button */}
            <div className="settings-actions">
              <button onClick={handleSavePreferences} disabled={saving} className="btn-primary btn-large">
                {saving ? 'Saving...' : 'Save Preferences'}
              </button>
              <p className="help-text">Changes will take effect on the next sync</p>
            </div>
          </div>
        )}

        {/* Extension Options Tab */}
        {activeTab === 'extension-options' && (
          <div className="tab-content">
            <h2>Extension Options</h2>
            <p className="subtitle">Customize your extension experience</p>

            <section className="settings-section">
              <h3>Appearance</h3>
              <div className="setting-item">
                <span className="setting-label">Theme:</span>
                <ToggleButton onClick={exampleThemeStorage.toggle}>
                  {isLight ? '☀️ Light Mode' : '🌙 Dark Mode'}
                </ToggleButton>
              </div>
            </section>

            <section className="settings-section">
              <h3>About</h3>
              <div className="setting-item">
                <p>Canvas2Calendar Extension</p>
                <p className="text-sm">Sync Canvas assignments to Google Calendar & Tasks</p>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Options, <LoadingSpinner />), ErrorDisplay);
