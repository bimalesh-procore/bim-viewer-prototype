import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import type { Toast as ToastData, ToastKind } from './types';

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

const KIND_STYLES: Record<ToastKind, { bg: string; border: string; iconColor: string; Icon: typeof CheckCircle2 }> = {
  success: { bg: 'bg-[#e8f5e9]', border: 'border-[#43a047]', iconColor: 'text-[#43a047]', Icon: CheckCircle2 },
  error:   { bg: 'bg-[#fdecea]', border: 'border-[#d93025]', iconColor: 'text-[#d93025]', Icon: AlertCircle },
  warning: { bg: 'bg-[#fff8e1]', border: 'border-[#f9a825]', iconColor: 'text-[#f9a825]', Icon: AlertTriangle },
  info:    { bg: 'bg-[#e8f0fe]', border: 'border-[#2066df]', iconColor: 'text-[#2066df]', Icon: Info },
};

export function Toast({ toast, onDismiss }: ToastProps) {
  const { bg, border, iconColor, Icon } = KIND_STYLES[toast.kind];

  return (
    <div
      role="status"
      className={`flex items-center gap-3 ${bg} border ${border} rounded px-4 py-2.5 shadow-md min-w-[280px] max-w-[480px]`}
    >
      <Icon size={18} className={`${iconColor} flex-shrink-0`} />
      <span className="text-sm font-medium text-[#232729] flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  );
}
