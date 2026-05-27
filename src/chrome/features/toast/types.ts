export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  // Duration in ms. -1 = auto-calculate from word count. 0 = sticky.
  duration: number;
  action?: ToastAction;
  // Set to true when the exit animation should begin. The toast stays in
  // the list until the animation completes and onRemove is called.
  dismissing: boolean;
}

export interface ShowToastOptions {
  kind?: ToastKind;
  message: string;
  // Omit to auto-calculate (3s + word_count × 0.5s). Pass 0 for sticky.
  duration?: number;
  action?: ToastAction;
}

export interface ToastApi {
  show: (opts: ShowToastOptions) => string;
  dismiss: (id: string) => void;
}
