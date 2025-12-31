import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@extension/ui';
import { Calendar, RefreshCw, Lock } from 'lucide-react';
import type { AppState } from '../App';

interface InjectedButtonsProps {
  onOpenPanel: () => void;
  onQuickSync: () => void;
  appState: AppState;
}

export const InjectedButtons = ({ onOpenPanel, onQuickSync, appState }: InjectedButtonsProps) => {
  const isLoading = appState === 'LOADING';
  const canSync = appState === 'READY';

  return (
    <div className="fixed bottom-6 left-6 z-[9999] flex flex-col gap-2">
      {/* Main Extension Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onOpenPanel}
            size="lg"
            className="bg-primary hover:bg-primary/90 h-12 w-12 rounded-full shadow-lg transition-all duration-200 hover:shadow-xl"
            disabled={isLoading}>
            <Calendar className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>Open Class2Calendar</p>
        </TooltipContent>
      </Tooltip>

      {/* Quick Sync Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onQuickSync}
            size="lg"
            variant={canSync ? 'secondary' : 'outline'}
            className="h-10 w-10 rounded-full shadow-md transition-all duration-200 hover:shadow-lg"
            disabled={!canSync || isLoading}>
            {canSync ? <RefreshCw className="h-4 w-4" /> : <Lock className="text-muted-foreground h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {canSync ? (
            <p>Quick Sync</p>
          ) : appState === 'SIGNED_OUT' ? (
            <p>Sign in to sync</p>
          ) : appState === 'NEEDS_ICS' ? (
            <p>Add ICS URL first</p>
          ) : (
            <p>Loading...</p>
          )}
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
