import { sync, user } from '@extension/shared';
import {
  Button,
  Switch,
  Separator,
  Input,
  RangeSlider,
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Checkbox,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@extension/ui';
import { RefreshCw, Clock, Calendar, ListTodo, Sliders, Trash2 } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { SyncPreferences, CanvasEventType, ApiSyncReport } from '@extension/shared';

// IMPORTANT: These must be defined OUTSIDE the component to prevent re-creation on each render
// Moving them inside causes React to lose input focus after every keystroke

const colorOptions = [
  { value: '', label: 'Default' },
  { value: '1', label: 'Lavender' },
  { value: '2', label: 'Sage' },
  { value: '3', label: 'Grape' },
  { value: '4', label: 'Flamingo' },
  { value: '5', label: 'Banana' },
  { value: '6', label: 'Tangerine' },
  { value: '7', label: 'Peacock' },
  { value: '8', label: 'Graphite' },
  { value: '9', label: 'Blueberry' },
  { value: '10', label: 'Basil' },
  { value: '11', label: 'Tomato' },
];

export const SettingsPanel = () => {
  const [allCourses, setAllCourses] = useState<string[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncSummary, setLastSyncSummary] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Full preferences state matching SyncPreferences
  const [preferences, setPreferences] = useState<SyncPreferences | null>(null);

  // Load preferences and courses
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load preferences
        const prefsResponse = await user.getPreferences();
        setPreferences(prefsResponse.preferences);

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

  // Debounce timer for text inputs
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Immediate save for toggles/selects
  const savePreferences = useCallback((updated: SyncPreferences) => {
    user.updatePreferences(updated).catch(console.error);
  }, []);

  // Debounced save for text inputs (prevents focus loss)
  const debouncedSave = useCallback((updated: SyncPreferences) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      user.updatePreferences(updated).catch(console.error);
    }, 500);
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    setLastSyncSummary(null);
    try {
      const result = await sync.performSync();
      setLastSynced(new Date());
      await chrome.storage.local.set({ canvas2calendar_sync_state: { last_synced: Date.now() } });

      // Build sync summary
      if (result.success && result.report) {
        const summary = formatSyncSummary(result.report);
        setLastSyncSummary(summary);
      }
    } catch (error) {
      console.error('[C2C] Sync failed:', error);
      setLastSyncSummary('Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const formatSyncSummary = (report: ApiSyncReport): string => {
    const parts: string[] = [];
    const cal = report.calendar.summary;
    const task = report.tasks.summary;

    const eventsCreated = cal.created;
    const eventsUpdated = cal.updated;
    const eventsDeleted = cal.deleted;
    const tasksCreated = task.tasks_created;
    const tasksUpdated = task.tasks_updated;
    const tasksDeleted = task.tasks_deleted;

    if (eventsCreated > 0) parts.push(`${eventsCreated} event${eventsCreated > 1 ? 's' : ''} created`);
    if (eventsUpdated > 0) parts.push(`${eventsUpdated} event${eventsUpdated > 1 ? 's' : ''} updated`);
    if (eventsDeleted > 0) parts.push(`${eventsDeleted} event${eventsDeleted > 1 ? 's' : ''} deleted`);
    if (tasksCreated > 0) parts.push(`${tasksCreated} task${tasksCreated > 1 ? 's' : ''} created`);
    if (tasksUpdated > 0) parts.push(`${tasksUpdated} task${tasksUpdated > 1 ? 's' : ''} updated`);
    if (tasksDeleted > 0) parts.push(`${tasksDeleted} task${tasksDeleted > 1 ? 's' : ''} deleted`);

    if (parts.length === 0) return 'Everything up to date';
    return parts.join(', ');
  };

  const handleReset = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to reset all synced data?\n\n' +
        'This will permanently delete:\n' +
        '• Your Class2Calendar Google Calendar\n' +
        '• All synced events\n' +
        '• All created task lists\n' +
        '• All synced tasks\n\n' +
        'Your preferences and settings will be preserved.\n\n' +
        'This action cannot be undone.',
    );

    if (!confirmed) return;

    setIsResetting(true);
    try {
      const result = await sync.reset();
      if (result.success) {
        setLastSynced(null);
        setLastSyncSummary('All data cleared');
        // Clear sync state from storage
        await chrome.storage.local.remove('canvas2calendar_sync_state');
      } else {
        setLastSyncSummary('Reset failed');
      }
    } catch (error) {
      console.error('[C2C] Reset failed:', error);
      setLastSyncSummary('Reset failed');
    } finally {
      setIsResetting(false);
    }
  };

  const formatLastSynced = () => {
    if (!lastSynced) return 'Never synced';
    const now = new Date();
    const diff = now.getTime() - lastSynced.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  // Event type toggles
  const toggleEventType = (section: 'calendar' | 'tasks', eventType: CanvasEventType, include: boolean) => {
    if (!preferences) return;

    const currentTypes = preferences[section].event_types || [];
    const newTypes = include ? [...currentTypes, eventType] : currentTypes.filter(t => t !== eventType);

    const updated = {
      ...preferences,
      [section]: { ...preferences[section], event_types: newTypes },
    };
    setPreferences(updated);
    savePreferences(updated);
  };

  // Course toggles
  const toggleCourse = (section: 'calendar' | 'tasks', courseCode: string, include: boolean) => {
    if (!preferences) return;

    const currentIncluded = preferences[section].included_courses || [];
    let newIncluded: string[];

    if (include) {
      newIncluded = currentIncluded.includes(courseCode) ? currentIncluded : [...currentIncluded, courseCode];
    } else {
      const explicitIncluded = currentIncluded.length === 0 ? [...allCourses] : [...currentIncluded];
      newIncluded = explicitIncluded.filter(c => c !== courseCode);
    }

    const updated = {
      ...preferences,
      [section]: { ...preferences[section], included_courses: newIncluded },
    };
    setPreferences(updated);
    savePreferences(updated);
  };

  const isCourseSynced = (section: 'calendar' | 'tasks', courseCode: string): boolean => {
    if (!preferences) return false;
    const included = preferences[section].included_courses || [];
    return included.length === 0 || included.includes(courseCode);
  };

  // Color coding
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
      calendar: { ...preferences.calendar, course_colors: newColors },
    };
    setPreferences(updated);
    savePreferences(updated);
  };

  // Custom names - uses debounced save to prevent focus loss while typing
  const updateCourseName = (courseCode: string, customName: string) => {
    if (!preferences) return;

    const newNames = { ...preferences.course_display_names };
    if (customName) {
      newNames[courseCode] = customName;
    } else {
      delete newNames[courseCode];
    }

    const updated = { ...preferences, course_display_names: newNames };
    setPreferences(updated);
    debouncedSave(updated); // Debounced to prevent focus loss
  };

  // Task settings
  const updateTaskOrganization = (value: 'per_course' | 'consolidated') => {
    if (!preferences) return;
    const updated = { ...preferences, tasks: { ...preferences.tasks, task_organization: value } };
    setPreferences(updated);
    savePreferences(updated);
  };

  const updateTaskListNaming = (value: 'code' | 'name' | 'combined') => {
    if (!preferences) return;
    const updated = { ...preferences, tasks: { ...preferences.tasks, task_list_naming: value } };
    setPreferences(updated);
    savePreferences(updated);
  };

  // Date range
  const updateDateRange = (field: 'past_days' | 'future_days', value: number) => {
    if (!preferences) return;
    const updated = {
      ...preferences,
      data_management: {
        ...preferences.data_management,
        date_range: {
          ...preferences.data_management?.date_range,
          past_days: preferences.data_management?.date_range?.past_days || 0,
          future_days: preferences.data_management?.date_range?.future_days || 365,
          [field]: value,
        },
        auto_archive_completed_tasks: preferences.data_management?.auto_archive_completed_tasks || false,
      },
    };
    setPreferences(updated);
    savePreferences(updated);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Sync Status Bar */}
      <div className="bg-muted/50 mb-6 flex items-center justify-between rounded-lg p-4">
        <div className="flex items-center gap-3">
          <Clock className="text-muted-foreground h-4 w-4" />
          <span className="text-muted-foreground text-sm">
            Last synced: <span className="text-foreground font-medium">{formatLastSynced()}</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          {lastSyncSummary && <span className="text-muted-foreground text-sm">{lastSyncSummary}</span>}
          <Button onClick={handleSync} disabled={isSyncing} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </div>
      </div>

      {/* Accordion Layout */}
      <Accordion type="multiple" defaultValue={['calendar', 'tasks']} className="flex-1 space-y-4">
        {/* Calendar Settings */}
        <AccordionItem value="calendar" className="rounded-lg border">
          <AccordionTrigger className="px-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <span className="font-semibold">Calendar Settings</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4">
              {/* Event Types */}
              <div>
                <h4 className="mb-2 text-sm font-medium">Event Types to Sync</h4>
                <div className="flex flex-wrap gap-4">
                  {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                  <label className="flex cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={preferences?.calendar.event_types.includes('assignment')}
                      onCheckedChange={checked => toggleEventType('calendar', 'assignment', !!checked)}
                    />
                    <span className="text-sm">Assignments</span>
                  </label>
                  {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                  <label className="flex cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={preferences?.calendar.event_types.includes('event')}
                      onCheckedChange={checked => toggleEventType('calendar', 'event', !!checked)}
                    />
                    <span className="text-sm">Events</span>
                  </label>
                </div>
              </div>

              <Separator />

              {/* Course Selection */}
              <div>
                <h4 className="mb-2 text-sm font-medium">Courses to Sync</h4>
                {loadingCourses ? (
                  <p className="text-muted-foreground text-sm">Loading courses...</p>
                ) : allCourses.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No courses found. Sync first to detect courses.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {allCourses.map(courseCode => (
                      <label key={courseCode} className="flex cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={isCourseSynced('calendar', courseCode)}
                          onCheckedChange={checked => toggleCourse('calendar', courseCode, !!checked)}
                        />
                        <span className="text-sm">{courseCode}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Color Coding */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-medium">Color Coding</h4>
                  <Switch
                    checked={preferences?.calendar.color_coding_enabled || false}
                    onCheckedChange={checked => {
                      if (!preferences) return;
                      const updated = {
                        ...preferences,
                        calendar: { ...preferences.calendar, color_coding_enabled: checked },
                      };
                      setPreferences(updated);
                      savePreferences(updated);
                    }}
                  />
                </div>
                {preferences?.calendar.color_coding_enabled && allCourses.length > 0 && (
                  <div className="space-y-2">
                    {allCourses.map(courseCode => (
                      <div key={courseCode} className="flex items-center justify-between gap-2">
                        <span className="text-sm">{courseCode}</span>
                        <Select
                          value={preferences.calendar.course_colors[courseCode] || ''}
                          onValueChange={value => updateCourseColor(courseCode, value)}>
                          <SelectTrigger className="w-32">
                            <SelectValue placeholder="Default" />
                          </SelectTrigger>
                          <SelectContent>
                            {colorOptions.map(opt => (
                              <SelectItem key={opt.value} value={opt.value || 'default'}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Tasks Settings */}
        <AccordionItem value="tasks" className="rounded-lg border">
          <AccordionTrigger className="px-4">
            <div className="flex items-center gap-2">
              <ListTodo className="h-5 w-5" />
              <span className="font-semibold">Tasks Settings</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4">
              {/* Event Types */}
              <div>
                <h4 className="mb-2 text-sm font-medium">Event Types to Sync</h4>
                <div className="flex flex-wrap gap-4">
                  {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                  <label className="flex cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={preferences?.tasks.event_types.includes('assignment')}
                      onCheckedChange={checked => toggleEventType('tasks', 'assignment', !!checked)}
                    />
                    <span className="text-sm">Assignments</span>
                  </label>
                  {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                  <label className="flex cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={preferences?.tasks.event_types.includes('event')}
                      onCheckedChange={checked => toggleEventType('tasks', 'event', !!checked)}
                    />
                    <span className="text-sm">Events</span>
                  </label>
                </div>
              </div>

              <Separator />

              {/* Course Selection */}
              <div>
                <h4 className="mb-2 text-sm font-medium">Courses to Sync</h4>
                {loadingCourses ? (
                  <p className="text-muted-foreground text-sm">Loading courses...</p>
                ) : allCourses.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No courses found. Sync first to detect.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {allCourses.map(courseCode => (
                      <label key={courseCode} className="flex cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={isCourseSynced('tasks', courseCode)}
                          onCheckedChange={checked => toggleCourse('tasks', courseCode, !!checked)}
                        />
                        <span className="text-sm">{courseCode}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Task Organization */}
              <div>
                <h4 className="mb-2 text-sm font-medium">Task Organization</h4>
                <RadioGroup
                  value={preferences?.tasks.task_organization || 'per_course'}
                  onValueChange={value => updateTaskOrganization(value as 'per_course' | 'consolidated')}>
                  {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                  <label className="flex cursor-pointer items-center gap-2">
                    <RadioGroupItem value="per_course" />
                    <span className="text-sm">Separate list per course</span>
                  </label>
                  {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                  <label className="flex cursor-pointer items-center gap-2">
                    <RadioGroupItem value="consolidated" />
                    <span className="text-sm">Single consolidated list</span>
                  </label>
                </RadioGroup>
              </div>

              <Separator />

              {/* Task List Naming */}
              <div>
                <h4 className="mb-2 text-sm font-medium">Task List Naming</h4>
                <RadioGroup
                  value={preferences?.tasks.task_list_naming === 'code' ? 'code' : 'custom'}
                  onValueChange={value => {
                    if (value === 'code') {
                      updateTaskListNaming('code');
                    } else {
                      // Default to 'name' when switching to custom
                      updateTaskListNaming('name');
                    }
                  }}>
                  {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                  <label className="flex cursor-pointer items-center gap-2">
                    <RadioGroupItem value="code" />
                    <span className="text-sm">Course code (e.g., "CS 101")</span>
                  </label>
                  {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                  <label className="flex cursor-pointer items-center gap-2">
                    <RadioGroupItem value="custom" />
                    <span className="text-sm">Custom names</span>
                  </label>
                </RadioGroup>
              </div>

              {/* Custom Course Names */}
              {preferences?.tasks.task_list_naming !== 'code' && allCourses.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="mb-2 text-sm font-medium">Custom Course Names</h4>
                    {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                    <label className="mb-3 flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={preferences?.tasks.task_list_naming === 'combined'}
                        onCheckedChange={checked => {
                          updateTaskListNaming(checked ? 'combined' : 'name');
                        }}
                      />
                      <span className="text-sm">Include course code as prefix</span>
                    </label>
                    <div className="space-y-2">
                      {allCourses.map(courseCode => (
                        <div key={courseCode} className="flex items-center gap-2">
                          <span className="w-20 text-sm">{courseCode}</span>
                          <Input
                            placeholder="Custom name..."
                            value={preferences?.course_display_names?.[courseCode] || ''}
                            onChange={e => updateCourseName(courseCode, e.target.value)}
                            onKeyDown={e => e.stopPropagation()}
                            className="flex-1"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Advanced Settings */}
        <AccordionItem value="advanced" className="rounded-lg border">
          <AccordionTrigger className="px-4">
            <div className="flex items-center gap-2">
              <Sliders className="h-5 w-5" />
              <span className="font-semibold">Advanced Settings</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4">
              {/* Date Range */}
              <div>
                <h4 className="mb-2 text-sm font-medium">Task Date Range</h4>
                <p className="text-muted-foreground mb-4 text-xs">
                  Keep tasks from {preferences?.data_management?.date_range?.past_days || 0} days ago to{' '}
                  {preferences?.data_management?.date_range?.future_days || 365} days ahead
                </p>
                <RangeSlider
                  maxPast={50}
                  maxFuture={150}
                  pastDays={preferences?.data_management?.date_range?.past_days || 0}
                  futureDays={preferences?.data_management?.date_range?.future_days || 14}
                  onPastDaysChange={value => updateDateRange('past_days', value)}
                  onFutureDaysChange={value => updateDateRange('future_days', value)}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Reset All Button */}
      <div className="mt-6 border-t pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-destructive text-sm font-medium">Reset All Data</h4>
            <p className="text-muted-foreground text-xs">Delete all synced calendars, events, task lists, and tasks</p>
          </div>
          <Button
            variant="destructive"
            onClick={handleReset}
            disabled={isResetting}
            className="gap-2"
            style={{ backgroundColor: '#dc2626', color: 'white', position: 'relative', zIndex: 10 }}>
            <Trash2 className="h-4 w-4" />
            {isResetting ? 'Resetting...' : 'Reset All'}
          </Button>
        </div>
      </div>
    </div>
  );
};
