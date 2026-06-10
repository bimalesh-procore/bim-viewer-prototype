import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface DropdownMenuProps {
  /** Viewport coords of the anchor.
   *  align='right' (default): menu right-aligns its right edge to `x`.
   *  align='left': menu left-aligns its left edge to `x`.
   *  `y` is the preferred top when the menu opens downward.
   *  `anchorTop` (optional): the trigger's top edge. When opening downward would
   *  overflow the viewport, the menu flips to sit just above this instead of
   *  clamping to the screen bottom, keeping it attached to the trigger. */
  position: { x: number; y: number; anchorTop?: number };
  align?: 'left' | 'right';
  onClose: () => void;
  children: React.ReactNode;
}

export function DropdownMenu({ position, align = 'right', onClose, children }: DropdownMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // After the menu lays out, nudge it back inside the viewport if it would
  // overflow any edge (e.g. a row menu opened near the bottom of the panel).
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const margin = 8;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Derive the intended anchor position from props (not the measured left/top,
    // which may be stale if this menu instance is reused for a new anchor).
    let left = align === 'right' ? position.x - width : position.x;
    let top = position.y;
    // Vertical: if opening downward overflows, flip above the trigger when we
    // know its top edge; otherwise fall back to clamping against the bottom.
    if (top + height > vh - margin) {
      const gap = 4; // matches the downward open offset, keeps it attached
      const flipped = position.anchorTop != null ? position.anchorTop - gap - height : null;
      top = flipped != null && flipped >= margin ? flipped : vh - margin - height;
    }
    // Horizontal: clamp into view.
    if (left + width > vw - margin) left = vw - margin - width;
    if (left < margin) left = margin;
    if (top < margin) top = margin;
    setCoords({ left, top });
  }, [position.x, position.y, position.anchorTop, align]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null;
      // Submenus and other helper surfaces render in their own portals (outside
      // menuRef). Tag them with data-dropdown-keep-open so a click there does not
      // close this menu on mousedown before their own onClick can run.
      if (target?.closest?.('[data-dropdown-keep-open]')) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, []);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed bg-white rounded shadow-[0_4px_16px_0_rgba(0,0,0,0.18)] py-1 z-[9999] w-fit"
      style={
        coords
          ? { left: coords.left, top: coords.top, transform: 'none' }
          : { left: position.x, top: position.y, transform: align === 'right' ? 'translateX(-100%)' : 'none' }
      }
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

export function DropdownMenuItem({
  onClick,
  onMouseEnter,
  onMouseLeave,
  disabled = false,
  trailingIcon,
  children,
}: {
  onClick?: () => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  trailingIcon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`w-full flex items-center justify-between px-4 h-[28px] text-[14px] text-left ${
        disabled
          ? 'text-[#9DA7AD] cursor-default'
          : 'text-[#232729] hover:bg-[#F4F5F6]'
      }`}
    >
      <span>{children}</span>
      {trailingIcon && <span className="ml-2 shrink-0">{trailingIcon}</span>}
    </button>
  );
}
