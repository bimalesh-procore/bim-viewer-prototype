import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ToastViewport } from './ToastViewport';
import type { ShowToastOptions, Toast, ToastApi } from './types';

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Starts the exit animation. Toast component calls remove() when done.
  const dismiss = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t)),
    );
  }, []);

  // Called by Toast after its exit animation completes.
  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (opts: ShowToastOptions): string => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const toast: Toast = {
        id,
        kind: opts.kind ?? 'info',
        message: opts.message,
        // -1 signals the Toast component to auto-calculate from word count.
        duration: opts.duration !== undefined ? opts.duration : -1,
        action: opts.action,
        dismissing: false,
      };
      setToasts((prev) => [...prev, toast]);
      return id;
    },
    [],
  );

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} onRemove={remove} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
