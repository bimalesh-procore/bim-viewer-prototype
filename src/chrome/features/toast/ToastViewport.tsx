import { Toast } from './Toast';
import type { Toast as ToastData } from './types';

interface ToastViewportProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      // Fixed bottom-center, above bottom toolbar but below modals.
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 flex flex-col-reverse items-center gap-2 pointer-events-none"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
