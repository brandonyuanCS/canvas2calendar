import { cn } from '@/lib/utils';
import { useCallback, useEffect, useState } from 'react';

const variantIcons = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

export const Toast = ({ message, variant = 'info', isVisible, onClose, duration = 3000 }: ToastProps) => {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClose = useCallback(() => {
    setIsAnimating(false);
    setTimeout(() => {
      onClose();
    }, 300); // Match animation duration
  }, [onClose]);

  useEffect(() => {
    if (isVisible) {
      setIsAnimating(true);
      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => clearTimeout(timer);
    } else {
      setIsAnimating(false);
      return undefined;
    }
  }, [isVisible, duration, handleClose]);

  if (!isVisible && !isAnimating) {
    return null;
  }

  return (
    <div className={cn('toast-container', isAnimating && isVisible ? 'toast-enter' : 'toast-exit', `toast-${variant}`)}>
      <div className="toast-content">
        <div className="toast-message-wrapper">
          <span className="toast-icon">{variantIcons[variant]}</span>
          <span className="toast-message">{message}</span>
          <button className="toast-close" onClick={handleClose} aria-label="Close notification">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
};

export interface ToastProps {
  message: string;
  variant?: 'success' | 'error' | 'info' | 'warning';
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
}
