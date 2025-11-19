import { cn } from '@/lib/utils';
import { useStorage } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { useState, useRef, useEffect, useCallback } from 'react';

interface RangeSliderProps {
  maxPast: number; // Maximum past days (e.g., 50, will be -50 to 0)
  maxFuture: number; // Maximum future days (e.g., 150, will be 0 to 150)
  pastDays: number; // Current past days (0 to maxPast, stored as positive)
  futureDays: number; // Current future days (0 to maxFuture)
  onPastDaysChange: (value: number) => void;
  onFutureDaysChange: (value: number) => void;
  className?: string;
}

export const RangeSlider = ({
  maxPast,
  maxFuture,
  pastDays,
  futureDays,
  onPastDaysChange,
  onFutureDaysChange,
  className,
}: RangeSliderProps) => {
  const { isLight } = useStorage(exampleThemeStorage);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<'past' | 'future' | null>(null);

  // Clamp values to valid ranges
  const clampedPastDays = Math.max(0, Math.min(pastDays, maxPast));
  const clampedFutureDays = Math.max(0, Math.min(futureDays, maxFuture));

  // Convert value to position on slider (0 is at center)
  // Left side: -maxPast to 0 (past days, negative)
  // Right side: 0 to maxFuture (future days, positive)
  const pastPosition = 50 - (clampedPastDays / maxPast) * 50; // 0% to 50% (left side)
  const futurePosition = 50 + (clampedFutureDays / maxFuture) * 50; // 50% to 100% (right side)

  // Convert pixel position to value
  const pixelToValue = useCallback(
    (pixelX: number, handle: 'past' | 'future'): number => {
      if (!sliderRef.current) return 0;
      const rect = sliderRef.current.getBoundingClientRect();
      const percent = ((pixelX - rect.left) / rect.width) * 100;

      if (handle === 'past') {
        // Left side: 0% to 50% maps to maxPast to 0
        if (percent < 0) return maxPast;
        if (percent > 50) return 0;
        const value = Math.round(maxPast * (1 - percent / 50));
        return Math.max(0, Math.min(value, maxPast));
      } else {
        // Right side: 50% to 100% maps to 0 to maxFuture
        if (percent < 50) return 0;
        if (percent > 100) return maxFuture;
        const value = Math.round(maxFuture * ((percent - 50) / 50));
        return Math.max(0, Math.min(value, maxFuture));
      }
    },
    [maxPast, maxFuture],
  );

  // Handle mouse/touch start
  const handleStart = useCallback((clientX: number, handle: 'past' | 'future') => {
    setIsDragging(handle);
  }, []);

  // Handle mouse/touch move
  const handleMove = useCallback(
    (clientX: number) => {
      if (!isDragging || !sliderRef.current) return;

      const newValue = pixelToValue(clientX, isDragging);

      if (isDragging === 'past') {
        // Past handle cannot go past 0 (center)
        const clampedValue = Math.max(0, Math.min(newValue, maxPast));
        onPastDaysChange(clampedValue);
      } else {
        // Future handle cannot go past 0 (center)
        const clampedValue = Math.max(0, Math.min(newValue, maxFuture));
        onFutureDaysChange(clampedValue);
      }
    },
    [isDragging, pixelToValue, maxPast, maxFuture, onPastDaysChange, onFutureDaysChange],
  );

  // Handle mouse/touch end
  const handleEnd = useCallback(() => {
    setIsDragging(null);
  }, []);

  // Mouse events
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      handleMove(e.clientX);
    };

    const handleMouseUp = () => {
      handleEnd();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMove, handleEnd]);

  // Touch events
  useEffect(() => {
    if (!isDragging) return;

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches[0]) {
        handleMove(e.touches[0].clientX);
      }
    };

    const handleTouchEnd = () => {
      handleEnd();
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, handleMove, handleEnd]);

  return (
    <div className={cn('range-slider-container', className)} style={{ marginTop: 'var(--space-md)' }}>
      <div
        ref={sliderRef}
        className={cn('relative h-8 w-full cursor-pointer', isLight ? 'bg-gray-200' : 'bg-gray-700', 'rounded-full')}
        style={{ touchAction: 'none' }}>
        {/* Track background */}
        <div className="absolute inset-0 rounded-full" />

        {/* Center marker (today = 0) */}
        <div
          className={cn('absolute bottom-0 top-0 w-0.5', isLight ? 'bg-gray-600' : 'bg-gray-400')}
          style={{ left: '50%', transform: 'translateX(-50%)' }}
        />

        {/* Selected range (between past and future handles) */}
        <div
          className={cn('absolute h-full rounded-full', isLight ? 'bg-blue-500' : 'bg-blue-400')}
          style={{
            left: `${pastPosition}%`,
            width: `${futurePosition - pastPosition}%`,
          }}
        />

        {/* Past days handle (left side) */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Past days cutoff"
          aria-valuemin={0}
          aria-valuemax={maxPast}
          aria-valuenow={clampedPastDays}
          className={cn(
            'absolute top-1/2 h-5 w-5 -translate-y-1/2 cursor-grab rounded-full border-2 shadow-md transition-transform hover:scale-110 active:cursor-grabbing',
            isLight ? 'border-blue-500 bg-white' : 'border-blue-400 bg-gray-800',
          )}
          style={{ left: `calc(${pastPosition}% - 10px)` }}
          onMouseDown={e => {
            e.preventDefault();
            handleStart(e.clientX, 'past');
          }}
          onTouchStart={e => {
            e.preventDefault();
            if (e.touches[0]) {
              handleStart(e.touches[0].clientX, 'past');
            }
          }}
          onKeyDown={e => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              const delta = e.key === 'ArrowLeft' ? -1 : 1;
              const newValue = Math.max(0, Math.min(clampedPastDays + delta, maxPast));
              onPastDaysChange(newValue);
            }
          }}>
          <div
            className={cn(
              'absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-xs font-medium',
              isLight ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-800',
            )}>
            {clampedPastDays} days ago
          </div>
        </div>

        {/* Future days handle (right side) */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Future days cutoff"
          aria-valuemin={0}
          aria-valuemax={maxFuture}
          aria-valuenow={clampedFutureDays}
          className={cn(
            'absolute top-1/2 h-5 w-5 -translate-y-1/2 cursor-grab rounded-full border-2 shadow-md transition-transform hover:scale-110 active:cursor-grabbing',
            isLight ? 'border-blue-400 bg-gray-800' : 'border-blue-500 bg-white',
          )}
          style={{ left: `calc(${futurePosition}% - 10px)` }}
          onMouseDown={e => {
            e.preventDefault();
            handleStart(e.clientX, 'future');
          }}
          onTouchStart={e => {
            e.preventDefault();
            if (e.touches[0]) {
              handleStart(e.touches[0].clientX, 'future');
            }
          }}
          onKeyDown={e => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              const delta = e.key === 'ArrowLeft' ? -1 : 1;
              const newValue = Math.max(0, Math.min(clampedFutureDays + delta, maxFuture));
              onFutureDaysChange(newValue);
            }
          }}>
          <div
            className={cn(
              'absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-xs font-medium',
              isLight ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-800',
            )}>
            {clampedFutureDays} days ahead
          </div>
        </div>
      </div>
    </div>
  );
};
