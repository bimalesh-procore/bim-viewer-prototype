import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface DropdownMenuProps {
  /** Viewport coords of the anchor. Menu right-aligns its right edge to `x`, top to `y`. */
  position: { x: number; y: number };
  onClose: () => void;
  children: React.ReactNode;
}

export function DropdownMenu({ position, onClose, children }: DropdownMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
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
      className="fixed bg-white rounded-lg shadow-[0_4px_16px_0_rgba(0,0,0,0.18)] py-1 z-[9999] w-52"
      style={{ left: position.x, top: position.y, transform: 'translateX(-100%)' }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

export function DropdownMenuItem({
  onClick,
  disabled = false,
  trailingIcon,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  trailingIcon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      className={`w-full flex items-center justify-between px-4 py-2.5 text-[14px] text-left ${
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
