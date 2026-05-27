import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import checkSuccessIcon from '../../assets/icons/toast/check-success.svg';
import alertErrorIcon from '../../assets/icons/toast/alert-error.svg';
import closeIcon from '../../assets/icons/header/close.svg';
import type { Toast as ToastData } from './types';

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
  onRemove: (id: string) => void;
}

// Spec: base 3s + (word count × 0.5s), minimum 3.5s
function calcDuration(message: string): number {
  const words = message.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(3500, 3000 + words * 500);
}

const KIND_BG: Record<string, string> = {
  success: 'bg-[#26732D]',
  error:   'bg-[#D92626]',
  warning: 'bg-[#B45309]',
  info:    'bg-[#1D4ED8]',
};

function KindIcon({ kind }: { kind: string }) {
  if (kind === 'success') {
    return <img src={checkSuccessIcon} alt="" className="w-5 h-5 flex-shrink-0" />;
  }
  if (kind === 'error') {
    return <img src={alertErrorIcon} alt="" className="w-5 h-5 flex-shrink-0" />;
  }
  if (kind === 'warning') {
    return <AlertTriangle size={20} className="text-white flex-shrink-0" />;
  }
  return <Info size={20} className="text-white flex-shrink-0" />;
}

export function Toast({ toast, onDismiss, onRemove }: ToastProps) {
  // Two-phase animation: false = entering (opacity 0, translated down), true = fully visible.
  const [entered, setEntered] = useState(false);

  const timerRef    = useRef<number | null>(null);
  const remainingMs = useRef<number>(-1);   // remaining time when paused
  const pausedAt    = useRef<number | null>(null);
  const removedRef  = useRef(false);

  const duration = toast.duration === -1 ? calcDuration(toast.message) : toast.duration;
  const isSticky = duration === 0;

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(
    (ms: number) => {
      if (isSticky || toast.dismissing) return;
      stopTimer();
      pausedAt.current = null;
      timerRef.current = window.setTimeout(() => onDismiss(toast.id), ms);
    },
    [isSticky, toast.dismissing, toast.id, onDismiss, stopTimer],
  );

  // Trigger the enter animation on the next frame so the CSS transition fires.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Start auto-dismiss timer after the toast has entered.
  useEffect(() => {
    if (!entered) return;
    remainingMs.current = duration;
    startTimer(duration);
    return stopTimer;
  }, [entered]); // eslint-disable-line react-hooks/exhaustive-deps

  // If parent marks us as dismissing, stop our own timer.
  useEffect(() => {
    if (toast.dismissing) stopTimer();
  }, [toast.dismissing, stopTimer]);

  // Only fire onRemove once, keyed on the opacity transition (not transform).
  const handleTransitionEnd = (e: React.TransitionEvent) => {
    if (toast.dismissing && !removedRef.current && e.propertyName === 'opacity') {
      removedRef.current = true;
      onRemove(toast.id);
    }
  };

  const handleMouseEnter = () => {
    if (pausedAt.current !== null) return; // already paused
    stopTimer();
    pausedAt.current = performance.now();
  };

  const handleMouseLeave = () => {
    if (pausedAt.current === null) return;
    const elapsed = performance.now() - pausedAt.current;
    remainingMs.current = Math.max(0, remainingMs.current - elapsed);
    pausedAt.current = null;
    startTimer(remainingMs.current);
  };

  // Mirror hover logic for keyboard focus.
  const handleFocus = handleMouseEnter;
  const handleBlur  = handleMouseLeave;

  // Entering:  opacity 0, translateY(+16px) → opacity 1, translateY(0)  — 100ms ease-out
  // Dismissing: opacity 1, translateY(0)    → opacity 0, translateY(+16px) — 150ms ease-in
  const isVisible = entered && !toast.dismissing;
  const transitionStyle: React.CSSProperties = {
    transition: toast.dismissing
      ? 'opacity 0.15s ease-in, transform 0.15s ease-in'
      : 'opacity 0.10s ease-out, transform 0.10s ease-out',
    opacity:   isVisible ? 1 : 0,
    transform: isVisible ? 'translateY(0)' : 'translateY(16px)',
  };

  const bg = KIND_BG[toast.kind] ?? KIND_BG.info;

  return (
    <div
      role="status"
      aria-live="polite"
      style={transitionStyle}
      onTransitionEnd={handleTransitionEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={`flex items-center gap-4 ${bg} rounded-xl px-6 shadow-[0_4px_20px_rgba(0,0,0,0.28)] w-[550px] h-14`}
    >
      <KindIcon kind={toast.kind} />

      <span className="text-sm font-semibold text-white flex-1 truncate">
        {toast.message}
      </span>

      {toast.action ? (
        <button
          type="button"
          onClick={() => { toast.action!.onClick(); onDismiss(toast.id); }}
          className="text-sm font-semibold text-white underline flex-shrink-0 hover:opacity-75 transition-opacity"
        >
          {toast.action.label}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss"
          className="flex-shrink-0 hover:opacity-75 transition-opacity"
        >
          <img src={closeIcon} alt="" className="w-4 h-4 brightness-0 invert" />
        </button>
      )}
    </div>
  );
}
