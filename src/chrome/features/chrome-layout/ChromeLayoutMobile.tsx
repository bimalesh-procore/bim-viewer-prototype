import { useState, useEffect, useRef, useCallback } from 'react';
import { RightToolbar } from '../right-toolbar/RightToolbar';
import { ViewerCanvas } from '../viewer-canvas/ViewerCanvas';
import { GlobalSearchOverlay } from '../global-search/GlobalSearchOverlay';
import { ModeIdentifierOverlay } from '../mode-identifier/ModeIdentifierOverlay';
import { PlaneContextMenu } from '../plane-context-menu/PlaneContextMenu';
import { PANEL_REGISTRY } from '../dock-manager/panelContent';
import clearIcon from '../../assets/icons/panel/clear.svg';
import type { PanelId } from '../dock-manager/useDockStore';
import { MobileHeader } from '../mobile-header';
import { MobileBottomBar } from '../mobile-bottom-bar';
import { JoystickOverlay } from '../joystick-overlay';
import type { ChromeLayoutProps } from './types';

export function ChromeLayoutMobile({
  viewerContainerRef,
  showOverlays = true,
  streamingProgress,
  streamingLabel = 'Loading model',
  streamingDetail = '',
  models,
  activeModelId,
  onSelectModel,
}: ChromeLayoutProps) {
  const [activeMobilePanel, setActiveMobilePanel] = useState<PanelId | null>(null);

  const [popoverVisible, setPopoverVisible] = useState(false);
  const barHoveredRef = useRef(false);
  const popoverHoveredRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      if (!barHoveredRef.current && !popoverHoveredRef.current) setPopoverVisible(false);
    }, 1500);
  }, [clearHideTimer]);

  const onBarEnter = useCallback(() => { barHoveredRef.current = true; clearHideTimer(); setPopoverVisible(true); }, [clearHideTimer]);
  const onBarLeave = useCallback(() => { barHoveredRef.current = false; scheduleHide(); }, [scheduleHide]);
  const onPopoverEnter = useCallback(() => { popoverHoveredRef.current = true; clearHideTimer(); }, [clearHideTimer]);
  const onPopoverLeave = useCallback(() => { popoverHoveredRef.current = false; scheduleHide(); }, [scheduleHide]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { panelId } = (e as CustomEvent).detail ?? {};
      if (!panelId) return;
      setActiveMobilePanel(panelId as PanelId);
    };
    const closeHandler = () => setActiveMobilePanel(null);
    window.addEventListener('mv:open-panel', handler);
    window.addEventListener('mv:close-mobile-panel', closeHandler);
    return () => {
      window.removeEventListener('mv:open-panel', handler);
      window.removeEventListener('mv:close-mobile-panel', closeHandler);
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-white">
      <GlobalSearchOverlay />

      <div className="absolute inset-0">
        <ViewerCanvas viewerContainerRef={viewerContainerRef} />

        {showOverlays && (
          <>
            <ModeIdentifierOverlay />
            <RightToolbar />
            <MobileSinglePanel
              panelId={activeMobilePanel}
              onClose={() => setActiveMobilePanel(null)}
            />
            <JoystickOverlay />
            <MobileBottomBar />
            <PlaneContextMenu />
          </>
        )}
      </div>

      <div className="absolute inset-x-0 top-0 z-[60]">
        <MobileHeader
          models={models}
          activeModelId={activeModelId}
          onSelectModel={onSelectModel}
        />
      </div>

      {streamingProgress != null && (
        <div
          className="mv-top-loading-bar absolute left-0 right-0 top-12 z-[61]"
          onMouseEnter={onBarEnter}
          onMouseLeave={onBarLeave}
        >
          <div className="mv-top-loading-bar-track">
            <div
              className="mv-top-loading-bar-fill"
              style={{ width: `${streamingProgress}%` }}
            />
          </div>
          <div
            className={`mv-top-loading-popover ${popoverVisible ? 'is-visible' : ''}`}
            onMouseEnter={onPopoverEnter}
            onMouseLeave={onPopoverLeave}
          >
            <div className="mv-top-loading-popover-text">
              <span className="mv-top-loading-popover-label">{streamingLabel}</span>
              <span className="mv-top-loading-popover-percent">
                {streamingDetail || `${streamingProgress}% Complete`}
              </span>
            </div>
            <button
              type="button"
              className="mv-top-loading-popover-btn"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('mv:open-panel', {
                  detail: { panelId: 'object-tree', label: 'Object Tree' },
                }));
              }}
            >
              View Object tree
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileSinglePanel({
  panelId,
  onClose,
}: {
  panelId: PanelId | null;
  onClose: () => void;
}) {
  if (!panelId) return null;
  const panel = PANEL_REGISTRY[panelId];
  if (!panel) return null;
  const Content = panel.Content;
  const Toolbar = panel.Toolbar;
  const labelMap: Record<PanelId, string> = {
    views: 'Views',
    items: 'Items',
    sheets: 'Sheets',
    'object-tree': 'Objects',
    properties: 'Properties',
    'search-sets': 'Groups',
    deviation: 'Deviations',
  };

  return (
    <div className="absolute right-2 top-14 bottom-24 w-[320px] z-50 rounded-[8px] bg-white shadow-[0_4px_16px_rgba(0,0,0,0.2)] flex flex-col overflow-hidden">
      <div className="h-12 px-3 flex items-center justify-between border-b border-[#d6dadc]">
        <span className="text-[24px] leading-6 font-semibold text-[#171a1c] truncate">{labelMap[panelId]}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="w-6 h-6 rounded flex items-center justify-center hover:bg-black/5"
        >
          <img src={clearIcon} alt="" width={16} height={16} />
        </button>
      </div>
      {Toolbar && (
        <div className="shrink-0">
          <Toolbar />
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto bg-white">
        <Content />
      </div>
    </div>
  );
}
