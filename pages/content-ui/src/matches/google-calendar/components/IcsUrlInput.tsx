import { user } from '@extension/shared';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Alert,
  AlertDescription,
} from '@extension/ui';
import { Link2, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { useState } from 'react';

interface IcsUrlInputProps {
  onSuccess: () => void;
}

type ValidationState = 'idle' | 'validating' | 'success' | 'error';

export const IcsUrlInput = ({ onSuccess }: IcsUrlInputProps) => {
  const [url, setUrl] = useState('');
  const [validationState, setValidationState] = useState<ValidationState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const validateAndSaveUrl = async () => {
    if (!url.trim()) {
      setValidationState('error');
      setErrorMessage('Please enter an ICS URL');
      return;
    }

    // Basic URL format validation
    if (!url.includes('.ics') && !url.includes('calendar')) {
      setValidationState('error');
      setErrorMessage("This doesn't look like a valid calendar URL");
      return;
    }

    setValidationState('validating');
    setErrorMessage('');

    try {
      // Save the URL via background script (which will validate it)
      await user.updateIcsUrl(url);

      setValidationState('success');

      // Small delay to show success state
      setTimeout(() => {
        onSuccess();
      }, 500);
    } catch (error) {
      setValidationState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to validate URL. Please check the URL and try again.',
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && validationState !== 'validating') {
      validateAndSaveUrl();
    }
  };

  return (
    <div className="flex h-full items-center justify-center">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="bg-primary/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
            <Link2 className="text-primary h-8 w-8" />
          </div>
          <CardTitle className="text-2xl">Add Your Canvas Calendar</CardTitle>
          <CardDescription>
            Paste your Canvas ICS calendar URL to get started. You can find this in Canvas under Calendar → Calendar
            Feed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="url"
              placeholder="https://canvas.instructure.com/feeds/calendars/..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={validationState === 'validating'}
              className={
                validationState === 'error'
                  ? 'border-destructive focus-visible:ring-destructive'
                  : validationState === 'success'
                    ? 'border-green-500 focus-visible:ring-green-500'
                    : ''
              }
            />
            <Button onClick={validateAndSaveUrl} disabled={validationState === 'validating'} className="shrink-0">
              {validationState === 'validating' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : validationState === 'success' ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                'Add'
              )}
            </Button>
          </div>

          {validationState === 'error' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <p className="text-muted-foreground text-center text-xs">
            Your calendar URL is stored locally and never sent to our servers.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
