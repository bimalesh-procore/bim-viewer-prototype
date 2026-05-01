import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useViewerAdapter } from '../viewer-adapter/ViewerAdapterContext';

type MenuState = { x: number; y: number; planeId: string } | null;

/**
 * Context menu shown when the user right-clicks on a sectioning plane.
 * Items: Flip, Delete. While open, the engine is told to suppress the
 * plane hover marker so the user gets a normal pointer over the menu.
 */
export function PlaneContextMenu() {
  const adapter = useViewerAdapter();
  const [state, setState] = useState<MenuState>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = adapter.subscribePlaneContextMenu?.((data) => {
      setState({ x: data.x, y: data.y, planeId: data.planeId });
    });
    return () => unsubscribe?.();
  }, [adapter]);

  useEffect(() => {
    if (!state) return;

    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setState(null);
        adapter.setPlaneContextMenuOpen?.(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setState(null);
        adapter.setPlaneContextMenuOpen?.(false);
      }
    };
    // mousedown on the canvas dispatches before our click; we listen for
    // both pointerdown (canvas) and contextmenu (next right-click moves it).
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [state, adapter]);

  // Clamp position so the menu doesn't render off-screen.
  useLayoutEffect(() => {
    if (!state || !ref.current) return;
    const el = ref.current;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let { x, y } = state;
    if (x + rect.width > vw - 8) x = Math.max(8, vw - rect.width - 8);
    if (y + rect.height > vh - 8) y = Math.max(8, vh - rect.height - 8);
    if (x !== state.x || y !== state.y) setState({ ...state, x, y });
  }, [state]);

  if (!state) return null;

  const close = () => {
    setState(null);
    adapter.setPlaneContextMenuOpen?.(false);
  };

  return (
    <div
      ref={ref}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[300] bg-white rounded shadow-[0_4px_12px_0_rgba(0,0,0,0.2)] py-1 min-w-[140px]"
      style={{ left: state.x, top: state.y, cursor: 'default' }}
    >
      <button
        type="button"
        className="w-full text-left px-3 py-1.5 text-[13px] leading-[18px] text-[#232729] hover:bg-[#E3E6E8]"
        onClick={() => {
          adapter.flipActiveSectionPlane?.();
          close();
        }}
      >
        Flip
      </button>
      <button
        type="button"
        className="w-full text-left px-3 py-1.5 text-[13px] leading-[18px] text-[#232729] hover:bg-[#E3E6E8]"
        onClick={() => {
          adapter.deleteActiveSectionPlane?.();
          close();
        }}
      >
        Delete
      </button>
    </div>
  );
}
