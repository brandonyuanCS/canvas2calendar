import { TrialBanner } from './TrialBanner';
import { sync, user } from '@extension/shared';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Switch,
  Badge,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@extension/ui';
import { RefreshCw, Clock, Settings2, Palette, Crown } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { SubscriptionData } from './TrialBanner';

interface SettingsPanelProps {
  subscriptionData: SubscriptionData;
}

export const SettingsPanel = ({ subscriptionData }: SettingsPanelProps) => {
  const { has_access, is_paid, tier } = subscriptionData;
  const canAccessProFeatures = has_access && (is_paid || tier === 'pro' || tier === 'max');
  const [allCourses, setAllCourses] = useState<string[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);

  // Settings state - load from actual preferences
  const [preferences, setPreferences] = useState<{
    calendar: {
      included_courses: string[];
      color_coding_enabled: boolean;
      course_colors: Record<string, string>;
    };
    tasks: {
      included_courses: string[];
    };
  } | null>(null);

  // Load preferences and courses
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load preferences
        const prefsResponse = await user.getPreferences();
        setPreferences({
          calendar: {
            included_courses: prefsResponse.preferences.calendar.included_courses || [],
            color_coding_enabled: prefsResponse.preferences.calendar.color_coding_enabled || false,
            course_colors: prefsResponse.preferences.calendar.course_colors || {},
          },
          tasks: {
            included_courses: prefsResponse.preferences.tasks.included_courses || [],
          },
        });

        // Fetch Canvas metadata for course list
        setLoadingCourses(true);
        try {
          const metadata = await user.getCanvasMetadata();
          const courseCodes = metadata.courses.map(c => c.code);
          setAllCourses(courseCodes);

          // Auto-populate if empty
          if (prefsResponse.preferences.calendar.included_courses.length === 0 && courseCodes.length > 0) {
            setPreferences(prev =>
              prev
                ? {
                    ...prev,
                    calendar: { ...prev.calendar, included_courses: courseCodes },
                  }
                : null,
            );
          }
          if (prefsResponse.preferences.tasks.included_courses.length === 0 && courseCodes.length > 0) {
            setPreferences(prev =>
              prev
                ? {
                    ...prev,
                    tasks: { ...prev.tasks, included_courses: courseCodes },
                  }
                : null,
            );
          }
        } catch {
          console.warn('Could not fetch Canvas metadata');
        } finally {
          setLoadingCourses(false);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    };
    loadData();
  }, []);

  // Fetch last sync time
  useEffect(() => {
    const loadLastSynced = async () => {
      try {
        const syncState = await chrome.storage.local.get('canvas2calendar_sync_state');
        if (syncState.canvas2calendar_sync_state?.last_synced) {
          setLastSynced(new Date(syncState.canvas2calendar_sync_state.last_synced));
        }
      } catch (error) {
        console.error('[C2C] Error loading last synced time:', error);
      }
    };
    loadLastSynced();
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await sync.performSync();
      setLastSynced(new Date());
      await chrome.storage.local.set({ canvas2calendar_sync_state: { last_synced: Date.now() } });
    } catch (error) {
      console.error('[C2C] Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CREATE_CHECKOUT_SESSION' });

      if (response.success && response.data?.checkout_url) {
        // Open Stripe Checkout in new tab
        window.open(response.data.checkout_url, '_blank');
      } else {
        console.error('[C2C] Failed to create checkout:', response.error);
        alert(response.error || 'Failed to start checkout. Please try again.');
      }
    } catch (error) {
      console.error('[C2C] Upgrade error:', error);
      alert('An error occurred. Please try again.');
    } finally {
      setIsUpgrading(false);
    }
  };

  const formatLastSynced = () => {
    if (!lastSynced) return 'Never synced';
    const now = new Date();
    const diff = now.getTime() - lastSynced.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m ago`;
    }
    if (minutes > 0) {
      return `${minutes}m ago`;
    }
    return 'Just now';
  };

  const toggleCourse = (courseCode: string, section: 'calendar' | 'tasks', include: boolean) => {
    if (!preferences) return;

    const currentIncluded = preferences[section]?.included_courses || [];
    let newIncluded: string[];

    if (include) {
      if (currentIncluded.length === 0) {
        newIncluded = [courseCode];
      } else if (!currentIncluded.includes(courseCode)) {
        newIncluded = [...currentIncluded, courseCode];
      } else {
        newIncluded = currentIncluded;
      }
    } else {
      const explicitIncluded = currentIncluded.length === 0 ? [...allCourses] : [...currentIncluded];
      newIncluded = explicitIncluded.filter(c => c !== courseCode);
    }

    const updated = {
      ...preferences,
      [section]: {
        ...preferences[section],
        included_courses: newIncluded,
      },
    };
    setPreferences(updated);

    // Save to background
    user
      .updatePreferences({
        calendar: {
          ...updated.calendar,
          event_types: [],
        },
        tasks: {
          ...updated.tasks,
          event_types: [],
          task_organization: 'per_course',
          task_list_naming: 'code',
        },
        sync: { auto_sync_enabled: false, auto_sync_interval_hours: 6 },
        data_management: {
          date_range: { past_days: 0, future_days: 365 },
          auto_archive_completed_tasks: false,
        },
        course_display_names: {},
      })
      .catch(console.error);
  };

  const isCourseSynced = (courseCode: string, section: 'calendar' | 'tasks'): boolean => {
    if (!preferences) return false;
    const included = preferences[section]?.included_courses || [];
    return included.includes(courseCode);
  };

  const updateCourseColor = (courseCode: string, colorId: string) => {
    if (!preferences) return;

    const newColors = { ...preferences.calendar.course_colors };
    if (colorId) {
      newColors[courseCode] = colorId;
    } else {
      delete newColors[courseCode];
    }

    const updated = {
      ...preferences,
      calendar: {
        ...preferences.calendar,
        course_colors: newColors,
      },
    };
    setPreferences(updated);

    // Save to background
    user
      .updatePreferences({
        calendar: {
          ...updated.calendar,
          event_types: [],
        },
        tasks: {
          ...updated.tasks,
          event_types: [],
          task_organization: 'per_course',
          task_list_naming: 'code',
        },
        sync: { auto_sync_enabled: false, auto_sync_interval_hours: 6 },
        data_management: {
          date_range: { past_days: 0, future_days: 365 },
          auto_archive_completed_tasks: false,
        },
        course_display_names: {},
      })
      .catch(console.error);
  };

  const FeatureGate = ({ children, locked, label }: { children: React.ReactNode; locked: boolean; label: string }) => {
    if (!locked) return <>{children}</>;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative">
            <div className="pointer-events-none opacity-50">{children}</div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Badge variant="secondary" className="gap-1">
                <Crown className="h-3 w-3" />
                Pro
              </Badge>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Upgrade to Pro to unlock {label}</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Trial Banner */}
      <TrialBanner subscriptionData={subscriptionData} onUpgrade={handleUpgrade} />

      {/* Sync Status Bar */}
      <div className="bg-muted/50 mb-6 flex items-center justify-between rounded-lg p-4">
        <div className="flex items-center gap-3">
          <Clock className="text-muted-foreground h-4 w-4" />
          <span className="text-muted-foreground text-sm">
            Last synced: <span className="text-foreground font-medium">{formatLastSynced()}</span>
          </span>
        </div>
        <Button onClick={handleSync} disabled={isSyncing || !has_access} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : has_access ? 'Sync Now' : 'Trial Expired'}
        </Button>
      </div>

      {/* Two Column Layout */}
      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column: Sync Settings */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                <CardTitle className="text-lg">Sync Settings</CardTitle>
              </div>
              <CardDescription>Configure what gets synced to your Google Calendar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Calendar Events</p>
                  <p className="text-muted-foreground text-sm">Sync classes and events</p>
                </div>
                <Switch
                  checked={preferences?.calendar.included_courses.length ? true : false}
                  onCheckedChange={() => {}}
                />
              </div>

              <Separator />

              <FeatureGate locked={!canAccessProFeatures} label="task syncing">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Tasks</p>
                    <p className="text-muted-foreground text-sm">Sync assignments to Google Tasks</p>
                  </div>
                  <Switch
                    checked={preferences?.tasks.included_courses.length ? true : false}
                    onCheckedChange={() => {}}
                    disabled={!canAccessProFeatures}
                  />
                </div>
              </FeatureGate>
            </CardContent>
          </Card>

          {/* Course Selection - Pro Feature */}
          <FeatureGate locked={!canAccessProFeatures} label="course selection">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Course Selection</CardTitle>
                <CardDescription>Choose which courses to sync to calendar</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingCourses ? (
                  <p className="text-muted-foreground text-sm">Loading courses...</p>
                ) : allCourses.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No courses found. Please sync first.</p>
                ) : (
                  <div className="space-y-2">
                    {allCourses.map(courseCode => (
                      <div key={courseCode} className="flex items-center justify-between">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isCourseSynced(courseCode, 'calendar')}
                            onChange={e => toggleCourse(courseCode, 'calendar', e.target.checked)}
                            className="h-4 w-4"
                          />
                          <span className="text-sm">{courseCode}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </FeatureGate>
        </div>

        {/* Right Column: Visual Settings */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                <CardTitle className="text-lg">Visual Settings</CardTitle>
              </div>
              <CardDescription>Customize how events appear in your calendar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FeatureGate locked={!canAccessProFeatures} label="custom colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Custom Colors</p>
                    <p className="text-muted-foreground text-sm">Color-code events by course</p>
                  </div>
                  <Switch
                    checked={preferences?.calendar.color_coding_enabled || false}
                    onCheckedChange={checked => {
                      if (!preferences) return;
                      const updated = {
                        ...preferences,
                        calendar: { ...preferences.calendar, color_coding_enabled: checked },
                      };
                      setPreferences(updated);
                      user
                        .updatePreferences({
                          calendar: { ...updated.calendar, event_types: [] },
                          tasks: {
                            ...updated.tasks,
                            event_types: [],
                            task_organization: 'per_course',
                            task_list_naming: 'code',
                          },
                          sync: { auto_sync_enabled: false, auto_sync_interval_hours: 6 },
                          data_management: { date_range: { past_days: 0, future_days: 365 } },
                          course_display_names: {},
                        })
                        .catch(console.error);
                    }}
                    disabled={!canAccessProFeatures}
                  />
                </div>
              </FeatureGate>

              {preferences?.calendar.color_coding_enabled && allCourses.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium">Course Colors</p>
                  {allCourses.map(courseCode => {
                    const colorId = preferences.calendar.course_colors[courseCode] || '';
                    return (
                      <div key={courseCode} className="flex items-center justify-between gap-2">
                        <span className="text-sm">{courseCode}</span>
                        <select
                          value={colorId}
                          onChange={e => updateCourseColor(courseCode, e.target.value)}
                          className="rounded border px-2 py-1 text-sm">
                          <option value="">Default</option>
                          <option value="1">Lavender</option>
                          <option value="2">Sage</option>
                          <option value="3">Grape</option>
                          <option value="4">Flamingo</option>
                          <option value="5">Banana</option>
                          <option value="6">Tangerine</option>
                          <option value="7">Peacock</option>
                          <option value="8">Graphite</option>
                          <option value="9">Blueberry</option>
                          <option value="10">Basil</option>
                          <option value="11">Tomato</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}

              <Separator />

              <FeatureGate locked={!canAccessProFeatures} label="custom naming">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Custom Naming</p>
                    <p className="text-muted-foreground text-sm">Rename courses for clarity</p>
                  </div>
                  <Switch checked={false} onCheckedChange={() => {}} disabled={!canAccessProFeatures} />
                </div>
                <p className="text-muted-foreground mt-2 text-xs">Custom naming available in full settings</p>
              </FeatureGate>
            </CardContent>
          </Card>

          {/* Upgrade Card */}
          {!is_paid && (
            <Card className="from-primary/5 to-primary/10 border-primary/20 bg-gradient-to-br">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Crown className="text-primary h-5 w-5" />
                  <CardTitle className="text-lg">{has_access ? 'Upgrade to Pro' : 'Continue with Pro'}</CardTitle>
                </div>
                <CardDescription>
                  {has_access ? 'Unlock lifetime access for $20' : 'Your trial has ended — unlock to continue syncing'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="mb-4 space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <span className="text-primary">✓</span> Sync every 15 minutes
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary">✓</span> Custom colors & naming
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary">✓</span> Course selection
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary">✓</span> Task syncing
                  </li>
                </ul>
                <Button className="w-full gap-2" onClick={handleUpgrade} disabled={isUpgrading}>
                  <Crown className="h-4 w-4" />
                  {isUpgrading ? 'Opening checkout...' : 'Upgrade Now'}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
