import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ToastViewport } from './ToastViewport';
import type { ShowToastOptions, Toast, ToastApi } from './types';

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION_MS = 3500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((opts: ShowToastOptions): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const toast: Toast = {
      id,
      kind: opts.kind ?? 'info',
      message: opts.message,
      duration: opts.duration ?? DEFAULT_DURATION_MS,
    };
    setToasts((prev) => [...prev, toast]);
    if (toast.duration > 0) {
      const timer = window.setTimeout(() => dismiss(id), toast.duration);
      timersRef.current.set(id, timer);
    }
    return id;
  }, [dismiss]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
