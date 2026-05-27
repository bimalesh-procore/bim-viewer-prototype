import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { FloatingWindowPosition } from './types';

interface FloatingWindowProps {
  title: string;
  onClose: () => void;
  // Width of the window in pixels. Height is content-driven.
  width?: number;
  // Initial position. If omitted, the window centers itself on first open.
  initialPosition?: FloatingWindowPosition;
  // Higher = renders above other floating windows. Default 50.
  zIndex?: number;
  children: React.ReactNode;
}

const DEFAULT_WIDTH = 340;
const TITLE_BAR_HEIGHT = 44;

export function FloatingWindow({
  title,
  onClose,
  width = DEFAULT_WIDTH,
  initialPosition,
  zIndex = 50,
  children,
}: FloatingWindowProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const [position, setPosition] = useState<FloatingWindowPosition | null>(initialPosition ?? null);

  // Center on first paint once the window's actual height is known.
  useEffect(() => {
    if (position !== null) return;
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition({
      x: Math.max(8, Math.round((window.innerWidth - rect.width) / 2)),
      y: Math.max(8, Math.round((window.innerHeight - rect.height) / 2)),
    });
  }, [position]);

  // Close on Escape — windows don't auto-dismiss on click-outside, but Esc
  // is the universal "close this thing" expectation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onTitlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!position) return;
    // Don't start a drag if the user pressed on the close button.
    const target = e.target as HTMLElement;
    if (target.closest('[data-window-close]')) return;
    e.preventDefault();
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: position.x,
      baseY: position.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);

  const onTitlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragState.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    // Clamp so the title bar stays grabbable on the screen.
    const root = rootRef.current;
    const rect = root?.getBoundingClientRect();
    const w = rect?.width ?? width;
    const minX = -(w - 60);
    const maxX = window.innerWidth - 60;
    const minY = 0;
    const maxY = window.innerHeight - TITLE_BAR_HEIGHT;
    setPosition({
      x: Math.min(maxX, Math.max(minX, drag.baseX + dx)),
      y: Math.min(maxY, Math.max(minY, drag.baseY + dy)),
    });
  }, [width]);

  const onTitlePointerUp = useCallback((e: React.PointerEvent) => {
    dragState.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  // Off-screen until centered to avoid a flash at (0,0).
  const visible = position !== null;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={title}
      aria-modal="false"
      style={{
        position: 'fixed',
        left: position?.x ?? 0,
        top:  position?.y ?? 0,
        width,
        zIndex,
        visibility: visible ? 'visible' : 'hidden',
      }}
      className="bg-white rounded-lg shadow-xl border border-gray-200 select-none"
    >
      <div
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={onTitlePointerUp}
        onPointerCancel={onTitlePointerUp}
        style={{ height: TITLE_BAR_HEIGHT, cursor: 'grab' }}
        className="flex items-center justify-between px-5 border-b border-gray-100"
      >
        <h2 className="text-lg font-semibold text-[#232729]">{title}</h2>
        <button
          type="button"
          data-window-close
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="text-gray-500 hover:text-gray-800 transition-colors"
        >
          <X size={20} />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
