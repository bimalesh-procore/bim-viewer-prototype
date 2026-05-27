export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  // Auto-dismiss delay in ms. 0 means sticky (manual dismiss only).
  duration: number;
}

export interface ShowToastOptions {
  kind?: ToastKind;
  message: string;
  duration?: number;
}

export interface ToastApi {
  show: (opts: ShowToastOptions) => string;
  dismiss: (id: string) => void;
}
