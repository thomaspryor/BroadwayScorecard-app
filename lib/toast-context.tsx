/**
 * Toast notification context — provides app-wide toast messages.
 *
 * Mobile toasts use plain strings only (no JSX — unlike web).
 * Optional linkRoute for tap-to-navigate behavior.
 */

import React, { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  id: string;
  text: string;
  type: ToastType;
  linkRoute?: string;
}

interface ToastContextValue {
  showToast: (text: string, type?: ToastType, linkRoute?: string) => void;
  toast: ToastMessage | null;
  dismissToast: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string, type: ToastType = 'success', linkRoute?: string) => {
    // Clear existing timer
    if (timerRef.current) clearTimeout(timerRef.current);

    const id = Date.now().toString();
    setToast({ id, text, type, linkRoute });

    // Auto-dismiss after 3 seconds
    timerRef.current = setTimeout(() => {
      setToast(null);
    }, 3000);
  }, []);

  const dismissToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, toast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

/** Safe version that returns no-ops when outside ToastProvider */
export function useToastSafe(): ToastContextValue {
  const context = useContext(ToastContext);
  return context || {
    showToast: () => {},
    toast: null,
    dismissToast: () => {},
  };
}
