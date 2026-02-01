import { Alert, AlertDescription } from '@extension/ui';
import { Clock, Crown } from 'lucide-react';

interface SubscriptionData {
  has_access: boolean;
  tier: 'free' | 'pro' | 'max';
  is_trial: boolean;
  is_paid: boolean;
  trial_days_remaining?: number;
  trial_expires_at?: string;
  reason?: string;
}

interface TrialBannerProps {
  subscriptionData: SubscriptionData;
  onUpgrade: () => void;
}

export const TrialBanner = ({ subscriptionData, onUpgrade }: TrialBannerProps) => {
  const { has_access, is_trial, is_paid, trial_days_remaining } = subscriptionData;

  // Paid users don't see banner
  if (is_paid) return null;

  // Trial active - show countdown
  if (has_access && is_trial) {
    const daysLeft = trial_days_remaining || 0;
    const isUrgent = daysLeft <= 3;

    return (
      <Alert variant={isUrgent ? 'destructive' : 'default'} className="mb-4">
        <Clock className="h-4 w-4" />
        <AlertDescription>
          <strong>
            Trial: {daysLeft} {daysLeft === 1 ? 'day' : 'days'} remaining
          </strong>
          {isUrgent && ' — Upgrade now to keep syncing!'}
        </AlertDescription>
      </Alert>
    );
  }

  // Trial expired - show upgrade prompt
  if (!has_access && is_trial) {
    return (
      <Alert variant="destructive" className="mb-4">
        <Crown className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between gap-2">
          <span>
            <strong>Your trial has ended.</strong> Upgrade to keep syncing.
          </span>
          <button onClick={onUpgrade} className="ml-2 whitespace-nowrap underline hover:no-underline">
            Upgrade Now
          </button>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
};

export type { SubscriptionData };
