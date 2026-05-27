import { Toast } from './Toast';
import type { Toast as ToastData } from './types';

interface ToastViewportProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
  onRemove: (id: string) => void;
}

export function ToastViewport({ toasts, onDismiss, onRemove }: ToastViewportProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      // 48px from the bottom of the viewport, horizontally centered.
      className="fixed bottom-12 left-1/2 -translate-x-1/2 z-40 flex flex-col-reverse items-center gap-2 pointer-events-none"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} onDismiss={onDismiss} onRemove={onRemove} />
        </div>
      ))}
    </div>
  );
}
