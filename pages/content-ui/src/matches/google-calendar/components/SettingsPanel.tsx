import { sync } from '@extension/shared';
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

export const SettingsPanel = () => {
  const [isPro, setIsPro] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Settings state
  const [settings, setSettings] = useState({
    syncCalendarEvents: true,
    syncTasks: true,
    customColors: false,
    customNaming: false,
  });

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const result = await chrome.storage.local.get(['subscription_tier', 'last_synced']);
      setIsPro(result.subscription_tier === 'pro');
      if (result.last_synced) {
        setLastSynced(new Date(result.last_synced));
      }
    } catch (error) {
      console.error('[C2C] Error loading user data:', error);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await sync.performSync();
      setLastSynced(new Date());
      await chrome.storage.local.set({ last_synced: Date.now() });
    } catch (error) {
      console.error('[C2C] Sync failed:', error);
    } finally {
      setIsSyncing(false);
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
      {/* Sync Status Bar */}
      <div className="bg-muted/50 mb-6 flex items-center justify-between rounded-lg p-4">
        <div className="flex items-center gap-3">
          <Clock className="text-muted-foreground h-4 w-4" />
          <span className="text-muted-foreground text-sm">
            Last synced: <span className="text-foreground font-medium">{formatLastSynced()}</span>
          </span>
          {!isPro && lastSynced && (
            <Badge variant="outline" className="text-xs">
              Free: 1 sync/24h
            </Badge>
          )}
        </div>
        <Button onClick={handleSync} disabled={isSyncing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : 'Sync Now'}
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
                  checked={settings.syncCalendarEvents}
                  onCheckedChange={checked => setSettings(s => ({ ...s, syncCalendarEvents: checked }))}
                />
              </div>

              <Separator />

              <FeatureGate locked={!isPro} label="task syncing">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Tasks</p>
                    <p className="text-muted-foreground text-sm">Sync assignments to Google Tasks</p>
                  </div>
                  <Switch
                    checked={settings.syncTasks}
                    onCheckedChange={checked => setSettings(s => ({ ...s, syncTasks: checked }))}
                    disabled={!isPro}
                  />
                </div>
              </FeatureGate>
            </CardContent>
          </Card>

          {/* Course Selection - Pro Feature */}
          <FeatureGate locked={!isPro} label="course selection">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Course Selection</CardTitle>
                <CardDescription>Choose which courses to sync</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Course selection will be available after your first sync
                </p>
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
              <FeatureGate locked={!isPro} label="custom colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Custom Colors</p>
                    <p className="text-muted-foreground text-sm">Color-code events by course</p>
                  </div>
                  <Switch
                    checked={settings.customColors}
                    onCheckedChange={checked => setSettings(s => ({ ...s, customColors: checked }))}
                    disabled={!isPro}
                  />
                </div>
              </FeatureGate>

              <Separator />

              <FeatureGate locked={!isPro} label="custom naming">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Custom Naming</p>
                    <p className="text-muted-foreground text-sm">Rename courses for clarity</p>
                  </div>
                  <Switch
                    checked={settings.customNaming}
                    onCheckedChange={checked => setSettings(s => ({ ...s, customNaming: checked }))}
                    disabled={!isPro}
                  />
                </div>
              </FeatureGate>
            </CardContent>
          </Card>

          {/* Upgrade Card */}
          {!isPro && (
            <Card className="from-primary/5 to-primary/10 border-primary/20 bg-gradient-to-br">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Crown className="text-primary h-5 w-5" />
                  <CardTitle className="text-lg">Upgrade to Pro</CardTitle>
                </div>
                <CardDescription>Unlock all features for a one-time payment of $20</CardDescription>
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
                <Button className="w-full gap-2">
                  <Crown className="h-4 w-4" />
                  Upgrade Now
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
