import { RightToolbarGroup } from './RightToolbarGroup';
import { RightToolbarButton } from './RightToolbarButton';
import { useViewerAdapter } from '../viewer-adapter/ViewerAdapterContext';
import { useViewerSettings } from '../viewer-settings/ViewerSettingsContext';
import type { ActionHistorySummary } from '../viewer-adapter/types';
import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import orthographicIcon from '../../assets/icons/right-toolbar/orthographic.svg';
import perspectiveIcon from '../../assets/icons/right-toolbar/perspective.svg';
import renderModesIcon from '../../assets/icons/right-toolbar/render-modes.svg';
import xRayIcon from '../../assets/icons/right-toolbar/x-ray.svg';
import markupIcon from '../../assets/icons/right-toolbar/markup.svg';
import measureIcon from '../../assets/icons/right-toolbar/measure.svg';
import quickCreateIcon from '../../assets/icons/right-toolbar/quick-create.svg';
import sectioningIcon from '../../assets/icons/right-toolbar/sectioning.svg';
import sectionBoxIcon from '../../assets/icons/right-toolbar/section-box.svg';
import sectionPlaneIcon from '../../assets/icons/right-toolbar/section-plane.svg';
import sectionCutIcon from '../../assets/icons/right-toolbar/section-cut.svg';
import sectionBoxDragFaceIcon from '../../assets/icons/right-toolbar/section-box-drag-face.svg';
import sectionBoxMoveIcon from '../../assets/icons/right-toolbar/section-box-move.png';
import sectionBoxRotateIcon from '../../assets/icons/right-toolbar/section-box-rotate.svg';
import resetIcon from '../../assets/icons/right-toolbar/reset.svg';
import saveIcon from '../../assets/icons/right-toolbar/save.svg';
import undoIcon from '../../assets/icons/right-toolbar/undo.svg';
import redoIcon from '../../assets/icons/right-toolbar/redo.svg';
import markupSelectIcon from '../../assets/icons/right-toolbar/markup-select.svg';
import markupTextIcon from '../../assets/icons/right-toolbar/markup-text.svg';
import markupLineIcon from '../../assets/icons/right-toolbar/markup-line.svg';
import markupRectIcon from '../../assets/icons/right-toolbar/markup-rect.svg';
import markupPenIcon from '../../assets/icons/right-toolbar/markup-pen.svg';
import markupFreehandIcon from '../../assets/icons/right-toolbar/markup-freehand.svg';
import markupCalloutIcon from '../../assets/icons/right-toolbar/markup-callout.svg';
import markupHighlighterIcon from '../../assets/icons/right-toolbar/markup-highlighter.svg';
import measureDistanceIcon from '../../assets/icons/right-toolbar/measure-distance.svg';
import measurePointIcon from '../../assets/icons/right-toolbar/measure-point.svg';
import measureAngleIcon from '../../assets/icons/right-toolbar/measure-angle.svg';
import measureAreaIcon from '../../assets/icons/right-toolbar/measure-area.svg';
import measureHeightIcon from '../../assets/icons/right-toolbar/measure-height.svg';

type ModeId = 'default' | 'markup' | 'measure' | 'create' | 'sectioning';

export function RightToolbar() {
  const adapter = useViewerAdapter();
  const {
    isOrthographic,
    isXRayActive,
    renderToggles,
    toggleOrthographic,
    toggleXRay,
    setRenderToggle,
  } = useViewerSettings();
  const [showTooltips, setShowTooltips] = useState(false);
  const [showFlyoutTooltips, setShowFlyoutTooltips] = useState(false);
  const [activeMode, setActiveMode] = useState<ModeId>('default');
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [openFlyout, setOpenFlyout] = useState<'measure' | 'create' | 'sectioning' | 'render' | 'history' | null>(null);
  const [activeMeasureTool, setActiveMeasureTool] = useState<'dimensions' | 'point-to-point' | 'laser' | 'manhole' | 'coordinates' | null>(null);
  const [activeSectionTool, setActiveSectionTool] = useState<'section-box' | 'section-plane' | 'section-cut' | null>(null);
  const [activeSectionBoxSubTool, setActiveSectionBoxSubTool] = useState<'drag-face' | 'move' | 'rotate'>('move');
  const [activeMarkupTool, setActiveMarkupTool] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [markupColor, setMarkupColor] = useState('#FF0000');
  const [isSectioningActive, setIsSectioningActive] = useState(
    () => adapter.isSectioningActive?.() ?? false,
  );
  const [actionHistory, setActionHistory] = useState<ActionHistorySummary>(
    () => adapter.getActionHistory?.() ?? {
      sectioningCount: 0, hiddenObjectsCount: 0, isolateCount: 0,
      markupsCount: 0, measurementsCount: 0,
    },
  );
  const [saveBadgeCount, setSaveBadgeCount] = useState<number | null>(null);
  const historySnapshot = useRef<ActionHistorySummary | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const saveBadgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (saveBadgeCount !== null) {
      if (saveBadgeTimer.current) clearTimeout(saveBadgeTimer.current);
      saveBadgeTimer.current = setTimeout(() => setSaveBadgeCount(null), 3000);
    }
    return () => {
      if (saveBadgeTimer.current) clearTimeout(saveBadgeTimer.current);
    };
  }, [saveBadgeCount]);

  const exitMarkupIfActive = () => {
    if (adapter.isMarkupModeActive?.()) {
      adapter.exitMarkupMode?.(true);
      setActiveMarkupTool(null);
    }
  };

  const setSectionBoxSubTool = (tool: 'drag-face' | 'move' | 'rotate') => {
    setActiveSectionBoxSubTool(tool);
    adapter.setSectionBoxSubTool?.(tool);
  };

  const snapshotHistory = () => {
    historySnapshot.current = adapter.getActionHistory?.() ?? actionHistory;
  };

  const triggerSaveBadge = () => {
    const snap = historySnapshot.current;
    const current = adapter.getActionHistory?.() ?? actionHistory;
    if (!snap) return;
    const delta =
      (current.sectioningCount - snap.sectioningCount) +
      (current.hiddenObjectsCount - snap.hiddenObjectsCount) +
      (current.isolateCount - snap.isolateCount) +
      (current.markupsCount - snap.markupsCount) +
      (current.measurementsCount - snap.measurementsCount);
    if (delta > 0) setSaveBadgeCount(delta);
    historySnapshot.current = null;
  };

  useEffect(() => {
    let label: string;
    if (activeMode === 'sectioning') {
      const subLabel: Record<string, string> = {
        'section-plane': 'Sectioning: Plane',
        'section-cut': 'Sectioning: Cut',
        'section-box': 'Sectioning: Box',
      };
      label = (activeSectionTool && subLabel[activeSectionTool]) || 'Sectioning';
    } else {
      const labelByMode: Record<ModeId, string> = {
        default: '',
        markup: 'Markup',
        measure: 'Measure',
        create: 'Create',
        sectioning: 'Sectioning',
      };
      label = labelByMode[activeMode];
    }
    window.dispatchEvent(
      new CustomEvent('mv:mode-identifier', {
        detail: {
          mode: activeMode,
          label,
          subTool: activeMode === 'sectioning' ? (activeSectionTool ?? null) : null,
        },
      }),
    );
  }, [activeMode, activeSectionTool]);

  useEffect(() => {
    const unsubscribe = adapter.subscribeActionHistory?.(setActionHistory);
    return () => unsubscribe?.();
  }, [adapter]);

  useEffect(() => {
    const unsubscribe = adapter.subscribeSectioningState?.(setIsSectioningActive);
    if (!unsubscribe) {
      setIsSectioningActive(adapter.isSectioningActive?.() ?? false);
    }
    return () => unsubscribe?.();
  }, [adapter]);

  useEffect(() => {
    const unsubscribe = adapter.subscribeRequestEditCut?.(() => {
      exitMarkupIfActive();
      setActiveMode('sectioning');
      setActiveSectionTool('section-cut');
      setOpenFlyout(null);
    });
    return () => unsubscribe?.();
  }, [adapter]);


  useEffect(() => {
    const unsubscribe = adapter.subscribeRequestEditPlane?.((tool) => {
      exitMarkupIfActive();
      setActiveMode('sectioning');
      setActiveSectionTool(tool);
      setOpenFlyout(null);
    });
    return () => unsubscribe?.();
  }, [adapter]);

  useEffect(() => {
    // When the context menu's "Isolate in section box" is clicked the engine
    // already positioned the section box and updated adapter state; we just
    // need to switch the React UI into section-box / move-sub-tool mode.
    const unsubscribe = adapter.subscribeIsolateInSectionBox?.(() => {
      exitMarkupIfActive();
      setActiveMode('sectioning');
      setActiveSectionTool('section-box');
      setActiveSectionBoxSubTool('move');
      setOpenFlyout(null);
    });
    return () => unsubscribe?.();
  }, [adapter]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ sourceId?: string }>).detail;
      const sourceId = detail?.sourceId;
      if (!sourceId) return;

      if (sourceId === 'mode:markup') {
        const viewId = (detail as { viewId?: string })?.viewId;
        snapshotHistory();
        enterMarkup(viewId ?? undefined);
        setOpenFlyout(null);
        return;
      }
      if (sourceId === 'mode:measure') {
        snapshotHistory();
        setActiveMode('measure');
        setActiveMeasureTool('dimensions');
        setOpenFlyout(null);
        return;
      }
      if (sourceId === 'mode:create') {
        snapshotHistory();
        setActiveMode('create');
        setOpenFlyout(null);
        return;
      }
      if (sourceId === 'mode:sectioning') {
        snapshotHistory();
        exitMarkupIfActive();
        setActiveMode('sectioning');
        setActiveSectionTool('section-box');
        setActiveSectionBoxSubTool('move');
        setOpenFlyout(null);
        adapter.setSectioningActive?.(true);
        adapter.setActiveSectioningTool?.('section-box');
        adapter.setSectionBoxSubTool?.('move');
        return;
      }
      if (sourceId === 'sectioning:section-box') {
        snapshotHistory();
        exitMarkupIfActive();
        setActiveMode('sectioning');
        setActiveSectionTool('section-box');
        setOpenFlyout(null);
        adapter.setSectioningActive?.(true);
        adapter.setActiveSectioningTool?.('section-box');
        return;
      }
      if (sourceId === 'sectioning:section-plane') {
        snapshotHistory();
        exitMarkupIfActive();
        setActiveMode('sectioning');
        setActiveSectionTool('section-plane');
        setOpenFlyout(null);
        adapter.setSectioningActive?.(true);
        adapter.setActiveSectioningTool?.('section-plane');
        return;
      }
      if (sourceId === 'sectioning:section-cut') {
        snapshotHistory();
        exitMarkupIfActive();
        setActiveMode('sectioning');
        setActiveSectionTool('section-cut');
        setOpenFlyout(null);
        adapter.setSectioningActive?.(true);
        adapter.setActiveSectioningTool?.('section-cut');
        return;
      }
      if (sourceId === 'flyout:render') {
        setActiveMode('default');
        setOpenFlyout('render');
      }
    };

    window.addEventListener('mv:activate-right-tool', handler);
    return () => window.removeEventListener('mv:activate-right-tool', handler);
  }, [adapter]);

  // Close any open flyout when the user clicks outside the toolbar.
  useEffect(() => {
    if (openFlyout === null && !isOverflowOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenFlyout(null);
        setIsOverflowOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => document.removeEventListener('pointerdown', onPointerDown, { capture: true });
  }, [openFlyout, isOverflowOpen]);

  const TopDefaultButtons = ({ showTooltip }: { showTooltip: boolean }) => (
    <>
      <RightToolbarButton
        src={isOrthographic ? perspectiveIcon : orthographicIcon}
        label={isOrthographic ? 'Perspective' : 'Orthographic'}
        showTooltip={showTooltip}
        isActive={isOrthographic}
        onClick={toggleOrthographic}
      />
      <div className="relative">
        <RightToolbarButton
          src={renderModesIcon}
          label="Render Settings"
          showTooltip={showTooltip && openFlyout !== 'render'}
          hasFlyout
          isActive={openFlyout === 'render'}
          onClick={() => setOpenFlyout((prev) => (prev === 'render' ? null : 'render'))}
        />
        {openFlyout === 'render' && (
          <div
            className="absolute right-full top-0 mr-2 z-[230]"
            onMouseEnter={(e) => {
              e.stopPropagation();
              setShowTooltips(false);
            }}
            onMouseLeave={() => {
              setShowTooltips(true);
            }}
          >
            <div
              className="bg-white rounded-[8px] flex flex-col p-[8px]"
              style={{ width: '200px', boxShadow: '0px 4px 12px 0px rgba(0,0,0,0.2)', gap: '4px' }}
            >
              {(
                [
                  { key: 'mesh', label: 'Mesh' },
                  { key: 'lines', label: 'Lines' },
                  { key: 'terrain', label: 'Terrain' },
                  { key: 'pointCloud', label: 'Point Cloud' },
                ] as { key: keyof typeof renderToggles; label: string }[]
              ).map(({ key, label }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '36px' }}>
                  {/* Toggle pill — flex-based thumb, no absolute positioning */}
                  <div
                    role="switch"
                    aria-checked={renderToggles[key]}
                    tabIndex={0}
                    onClick={() => setRenderToggle(key, !renderToggles[key])}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        setRenderToggle(key, !renderToggles[key]);
                      }
                    }}
                    style={{
                      width: '36px',
                      height: '20px',
                      borderRadius: '10px',
                      backgroundColor: renderToggles[key] ? '#2B5CE6' : '#C2C8CC',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'background-color 150ms',
                    }}
                  >
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        backgroundColor: 'white',
                        flexShrink: 0,
                        marginLeft: renderToggles[key] ? '16px' : '0px',
                        transition: 'margin-left 150ms',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      flex: 1,
                      fontSize: '14px',
                      fontWeight: 400,
                      lineHeight: '20px',
                      letterSpacing: '0.15px',
                      color: '#232729',
                      userSelect: 'none',
                    }}
                  >
                    {label}
                  </span>
                  {key === 'pointCloud' && (
                    <button
                      type="button"
                      aria-label="Edit Point Cloud"
                      className="flex items-center justify-center rounded transition-colors flex-shrink-0"
                      style={{ width: '28px', height: '28px', backgroundColor: '#E3E6E8' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#D6DADC'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#E3E6E8'; }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="#232729" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <RightToolbarButton
        src={xRayIcon}
        label="Xray"
        shortcut="Cmd X"
        showTooltip={showTooltip}
        isActive={isXRayActive}
        onClick={toggleXRay}
      />
    </>
  );

  const enterMarkup = (viewId?: string) => {
    adapter.enterMarkupMode?.(viewId);
    setActiveMode('markup');
    setActiveMarkupTool('freehand');
    adapter.setMarkupTool?.('freehand');
    window.dispatchEvent(new CustomEvent('mv:open-panel', { detail: { panelId: 'views', label: 'Viewpoints' } }));
  };

  const modeButtons = [
    {
      id: 'markup' as const,
      src: markupIcon,
      label: 'Markup',
      shortcut: 'P P',
      onClick: () => { snapshotHistory(); enterMarkup(); },
      enterMode: () => { snapshotHistory(); enterMarkup(); },
    },
    {
      id: 'measure' as const,
      src: measureIcon,
      label: 'Measure',
      shortcut: 'M M',
      onClick: () => { snapshotHistory(); setOpenFlyout((prev) => (prev === 'measure' ? null : 'measure')); },
      enterMode: () => { snapshotHistory(); setActiveMode('measure'); setActiveMeasureTool('dimensions'); adapter.toggleMeasureTool?.(); },
    },
    {
      id: 'create' as const,
      src: quickCreateIcon,
      label: 'Create Item',
      shortcut: 'C C',
      onClick: () => { snapshotHistory(); setOpenFlyout((prev) => (prev === 'create' ? null : 'create')); },
      enterMode: () => { snapshotHistory(); setActiveMode('create'); },
    },
    {
      id: 'sectioning' as const,
      src: sectioningIcon,
      label: 'Sectioning',
      shortcut: 'X X',
      onClick: () => {
        snapshotHistory();
        exitMarkupIfActive();
        setActiveMode('sectioning');
        setActiveSectionTool('section-box');
        setActiveSectionBoxSubTool('move');
        setOpenFlyout(null);
        adapter.setSectioningActive?.(true);
        adapter.setActiveSectioningTool?.('section-box');
        adapter.setSectionBoxSubTool?.('move');
      },
      enterMode: () => {
        snapshotHistory();
        exitMarkupIfActive();
        setActiveMode('sectioning');
        setActiveSectionTool('section-box');
        setActiveSectionBoxSubTool('move');
        adapter.setSectioningActive?.(true);
        adapter.setActiveSectioningTool?.('section-box');
        adapter.setSectionBoxSubTool?.('move');
      },
    },
  ];

  const overflowModeButtons = modeButtons.filter((button) => button.id !== activeMode && button.id !== 'create');
  const isSectioningMode = activeMode === 'sectioning';

  // Suppress tooltips on buttons whose tooltip area overlaps the mode toolbar overflow flyout
  const lowerGroupTooltips = showTooltips && !isOverflowOpen;
  // Suppress lower default tooltips only when a lower flyout overlaps them.
  // Render flyout should NOT suppress Sectioning/History tooltips.
  // History flyout should NOT suppress upper tooltips.
  const lowerDefaultTooltips =
    showTooltips &&
    (openFlyout === null || openFlyout === 'render' || openFlyout === 'history');

  const defaultToolbar = (
    <>
      {/* View group */}
      <RightToolbarGroup>
        <TopDefaultButtons showTooltip={showTooltips} />
      </RightToolbarGroup>

      {/* Tools group */}
      <RightToolbarGroup>
        {modeButtons.map((button) => {
          const hasFlyout = button.id === 'measure' || button.id === 'create';

          if (button.id === 'measure') {
            return (
              <div key={button.id} className="relative">
                <RightToolbarButton
                  src={button.src}
                  label={button.label}
                  shortcut={button.shortcut}
                  showTooltip={showTooltips && openFlyout !== 'measure'}
                  hasFlyout
                  isActive={openFlyout === 'measure'}
                  onClick={button.onClick}
                />
                {openFlyout === 'measure' && (
                  <div
                    className="absolute right-full top-0 mr-2 z-[230] flex flex-col gap-2 w-max"
                    onMouseEnter={(e) => {
                      e.stopPropagation();
                      setShowFlyoutTooltips(true);
                      setShowTooltips(false);
                    }}
                    onMouseLeave={() => {
                      setShowFlyoutTooltips(false);
                      setShowTooltips(true);
                    }}
                  >
                    <RightToolbarGroup>
                      <RightToolbarButton src={measureDistanceIcon} label="Dimensions" shortcut="R" showTooltip={showFlyoutTooltips} onClick={() => { setActiveMeasureTool('dimensions'); setActiveMode('measure'); setOpenFlyout(null); adapter.toggleMeasureTool?.(); }} />
                      <RightToolbarButton src={measurePointIcon} label="Point to Point" shortcut="P" showTooltip={showFlyoutTooltips} onClick={() => { setActiveMeasureTool('point-to-point'); setActiveMode('measure'); setOpenFlyout(null); adapter.toggleMeasureTool?.(); }} />
                      <RightToolbarButton src={measureAngleIcon} label="Laser" shortcut="L" showTooltip={showFlyoutTooltips} onClick={() => { setActiveMeasureTool('laser'); setActiveMode('measure'); setOpenFlyout(null); adapter.toggleMeasureTool?.(); }} />
                      <RightToolbarButton src={measureAreaIcon} label="Manhole" shortcut="M" showTooltip={showFlyoutTooltips} onClick={() => { setActiveMeasureTool('manhole'); setActiveMode('measure'); setOpenFlyout(null); adapter.toggleMeasureTool?.(); }} />
                      <RightToolbarButton src={measureHeightIcon} label="Coordinates" shortcut="C" showTooltip={showFlyoutTooltips} onClick={() => { setActiveMeasureTool('coordinates'); setActiveMode('measure'); setOpenFlyout(null); adapter.toggleMeasureTool?.(); }} />
                    </RightToolbarGroup>
                  </div>
                )}
              </div>
            );
          }

          if (button.id === 'create') {
            return (
              <div key={button.id} className="relative">
                <RightToolbarButton
                  src={button.src}
                  label={button.label}
                  shortcut={button.shortcut}
                  showTooltip={showTooltips && openFlyout !== 'measure' && openFlyout !== 'create'}
                  hasFlyout
                  isActive={openFlyout === 'create'}
                  onClick={button.onClick}
                />
                {openFlyout === 'create' && (
                  <div
                    className="absolute right-full top-0 mr-2 z-[230] w-max"
                    onMouseEnter={(e) => {
                      e.stopPropagation();
                      setShowTooltips(false);
                    }}
                    onMouseLeave={() => {
                      setShowTooltips(true);
                    }}
                  >
                    <div className="bg-white rounded-lg shadow-[0_4px_12px_0_rgba(0,0,0,0.2)] flex flex-col w-[215px]">
                      <div className="flex flex-col gap-3 p-2">
                        {/* Coordination Issues */}
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[12px] leading-[16px] tracking-[0.25px] text-[#171A1C]">Coordination Issues</span>
                          <div className="flex gap-1">
                            {['MD', 'PL', 'FP', 'EL', 'AR'].map((initials) => (
                              <button key={initials} type="button" className="bg-[#F3BEBE] rounded p-1 text-[12px] font-semibold leading-[16px] tracking-[0.25px] text-[#821717] hover:opacity-80">
                                {initials}
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* Inspections */}
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[12px] leading-[16px] tracking-[0.25px] text-[#171A1C]">Inspections</span>
                          <div className="flex gap-1">
                            <button type="button" className="bg-[#0D2959] rounded p-1 text-[12px] font-semibold leading-[16px] tracking-[0.25px] text-[#D2E0F9] hover:opacity-80">MD</button>
                            {['PL', 'FP', 'EL'].map((initials) => (
                              <button key={initials} type="button" className="bg-[#BCD1F5] rounded p-1 text-[12px] font-semibold leading-[16px] tracking-[0.25px] text-[#133D86] hover:opacity-80">
                                {initials}
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* Punchlist */}
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[12px] leading-[16px] tracking-[0.25px] text-[#171A1C]">Punchlist</span>
                          <div className="flex gap-1">
                            {['PL', 'FP', 'ST'].map((initials) => (
                              <button key={initials} type="button" className="bg-[#C6ECC9] rounded p-1 text-[12px] font-semibold leading-[16px] tracking-[0.25px] text-[#26732D] hover:opacity-80">
                                {initials}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      {/* Footer */}
                      <div className="bg-[#EEF0F1] rounded-b-lg flex gap-1 items-center justify-end px-2 py-2">
                        <button type="button" className="flex items-center gap-1 px-2 py-1 text-[12px] text-[#232729] hover:bg-[#E3E6E8] rounded">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="#232729" />
                          </svg>
                          Edit
                        </button>
                        <button type="button" className="flex items-center gap-1 px-2 py-1 text-[12px] text-[#232729] hover:bg-[#E3E6E8] rounded">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="#232729" />
                          </svg>
                          Template
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          }

          if (button.id === 'sectioning') {
            return (
              <RightToolbarButton
                key={button.id}
                src={button.src}
                label={button.label}
                shortcut={button.shortcut}
                showTooltip={lowerDefaultTooltips}
                isActive={false}
                onClick={button.onClick}
              />
            );
          }

          return (
            <RightToolbarButton
              key={button.id}
              src={button.src}
              label={button.label}
              shortcut={button.shortcut}
              showTooltip={button.id === 'markup' ? showTooltips : lowerDefaultTooltips}
              hasFlyout={hasFlyout}
              isActive={false}
              onClick={button.onClick}
            />
          );
        })}
      </RightToolbarGroup>

      {/* History group */}
      <RightToolbarGroup>
        <div className="relative">
          <RightToolbarButton
            src={resetIcon}
            label="Refresh"
            shortcut="Cmd R"
            showTooltip={lowerDefaultTooltips && openFlyout !== 'history'}
            hasFlyout
            isActive={openFlyout === 'history'}
            onClick={() => setOpenFlyout(prev => prev === 'history' ? null : 'history')}
          />
          {saveBadgeCount !== null && (
            <div
              key={saveBadgeCount}
              aria-label={`${saveBadgeCount} modifications saved`}
              className="pointer-events-none absolute top-[8px] right-full -mr-2 z-[240]"
              style={{
                animation: 'mv-badge-pop 0.25s cubic-bezier(0.34,1.56,0.64,1) both, mv-badge-fade 0.4s ease-in 2.6s both',
              }}
            >
              <div
                className="flex items-center bg-[#FF5100] text-white rounded-[10px]"
                style={{ padding: '2px 8px', gap: 0 }}
              >
                <span
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '12px',
                    fontWeight: 600,
                    lineHeight: '16px',
                    letterSpacing: '0.25px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {saveBadgeCount}
                </span>
                <span
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '12px',
                    fontWeight: 600,
                    lineHeight: '16px',
                    letterSpacing: '0.25px',
                  }}
                >
                  +
                </span>
              </div>
            </div>
          )}
          {openFlyout === 'history' && (
            <div
              className="absolute right-full top-0 mr-2 z-[230] w-max"
              onMouseEnter={(e) => {
                e.stopPropagation();
                setShowTooltips(false);
              }}
              onMouseLeave={() => {
                setShowTooltips(true);
              }}
            >
              <ActionHistoryFlyout
                history={actionHistory}
                onClear={(cat) => adapter.clearActionCategory?.(cat)}
                onClearAll={() => adapter.clearAllActions?.()}
              />
            </div>
          )}
        </div>
        <RightToolbarButton src={undoIcon} label="Undo" shortcut="Cmd Z" showTooltip={lowerDefaultTooltips} onClick={() => adapter.undo?.()} />
        <RightToolbarButton
          src={redoIcon}
          label="Redo"
          shortcut="Cmd Y"
          showTooltip={showTooltips && (openFlyout === null || openFlyout === 'render' || openFlyout === 'measure' || openFlyout === 'history')}
          onClick={() => adapter.redo?.()}
        />
      </RightToolbarGroup>
    </>
  );

  return (
    <div
      ref={toolbarRef}
      id="right-toolbar"
      className={`absolute right-2 top-2 flex flex-col gap-2 ${
        activeMode === 'default' ? 'z-20' : 'z-[220]'
      }`}
      onMouseEnter={() => setShowTooltips(true)}
      onMouseLeave={() => setShowTooltips(false)}
    >
      {activeMode === 'default' ? defaultToolbar : (
        <>
          {/* Exit group — checkmark saves, X clears and exits */}
          <RightToolbarGroup>
            {/* Save and exit */}
            <button
              type="button"
              aria-label="Save and exit"
              onClick={() => {
                if (activeMode === 'markup' || activeMode === 'create') {
                  adapter.exitMarkupMode?.(true);
                  setActiveMarkupTool(null);
                }
                if (activeMode === 'sectioning') {
                  adapter.commitActiveCut?.();
                  adapter.setActiveSectioningTool?.(null);
                  adapter.setSectioningActive?.(false);
                }
                triggerSaveBadge();
                setActiveMode('default');
                setIsOverflowOpen(false);
                setActiveMeasureTool(null);
                setActiveSectionTool(null);
              }}
              className="mv-toolbar-button relative flex items-center justify-center rounded p-1.5 transition-colors bg-[#D4EDDA] hover:bg-[#C3E6CB]"
            >
              <img src={saveIcon} width={24} height={24} alt="" aria-hidden="true" />
              {showTooltips && (
                <div className="mv-toolbar-tooltip mv-toolbar-tooltip-left" aria-hidden="true">
                  <span className="mv-toolbar-tooltip-shortcut">Enter</span>
                  <span className="mv-toolbar-tooltip-label">Save and exit</span>
                </div>
              )}
            </button>
            {/* Clear and exit */}
            <button
              type="button"
              aria-label="Clear and exit"
              onClick={() => {
                if (activeMode === 'markup' || activeMode === 'create') {
                  adapter.exitMarkupMode?.(false);
                  setActiveMarkupTool(null);
                }
                if (activeMode === 'sectioning') {
                  // Clear all section planes/box before deactivating
                  adapter.clearSectioningPlanes?.();
                  adapter.setActiveSectioningTool?.(null);
                  adapter.setSectioningActive?.(false);
                }
                setActiveMode('default');
                setIsOverflowOpen(false);
                setActiveMeasureTool(null);
                setActiveSectionTool(null);
              }}
              className="mv-toolbar-button relative flex items-center justify-center rounded p-1.5 transition-colors bg-[#F8D7DA] hover:bg-[#F5C6C6]"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <g transform="translate(3 3)">
                  <path d="M11.3686 9.00025L18.0003 2.36856L15.6317 0L9 6.63169L2.36856 0.000253665L0 2.36881L6.63144 9.00025L0 15.6317L2.36856 18.0003L9 11.3688L15.6317 18.0005L18.0003 15.6319L11.3686 9.00025Z" fill="#842029"/>
                </g>
              </svg>
              {showTooltips && (
                <div className="mv-toolbar-tooltip mv-toolbar-tooltip-left" aria-hidden="true">
                  <span className="mv-toolbar-tooltip-shortcut">Esc</span>
                  <span className="mv-toolbar-tooltip-label">Clear and exit</span>
                </div>
              )}
            </button>
          </RightToolbarGroup>

          {/* Mode-specific tools — only this group changes per mode */}
          {activeMode === 'sectioning' ? (
            <>
              <RightToolbarGroup>
                <RightToolbarButton src={sectionBoxIcon} label="Section box" shortcut="--" showTooltip={showTooltips} isActive={activeSectionTool === 'section-box'} onClick={() => { setActiveSectionTool('section-box'); setActiveSectionBoxSubTool('move'); adapter.setActiveSectioningTool?.('section-box'); adapter.setSectionBoxSubTool?.('move'); }} />
                <RightToolbarButton src={sectionPlaneIcon} label="Section plane" shortcut="--" showTooltip={showTooltips} isActive={activeSectionTool === 'section-plane'} onClick={() => { setActiveSectionTool('section-plane'); adapter.setActiveSectioningTool?.('section-plane'); }} />
                <RightToolbarButton src={sectionCutIcon} label="Section cut" shortcut="--" showTooltip={showTooltips} isActive={activeSectionTool === 'section-cut'} onClick={() => { setActiveSectionTool('section-cut'); adapter.setActiveSectioningTool?.('section-cut'); }} />
              </RightToolbarGroup>

              {/* Section-box sub-tools */}
              {activeSectionTool === 'section-box' && (
                <RightToolbarGroup>
                  <RightToolbarButton
                    src={sectionBoxMoveIcon}
                    label="Move box"
                    showTooltip={showTooltips}
                    isActive={activeSectionBoxSubTool === 'move'}
                    onClick={() => setSectionBoxSubTool('move')}
                  />
                  <RightToolbarButton
                    src={sectionBoxDragFaceIcon}
                    label="Drag face"
                    showTooltip={showTooltips}
                    isActive={activeSectionBoxSubTool === 'drag-face'}
                    onClick={() => setSectionBoxSubTool('drag-face')}
                  />
                  <RightToolbarButton
                    src={sectionBoxRotateIcon}
                    label="Rotate box"
                    showTooltip={showTooltips}
                    isActive={activeSectionBoxSubTool === 'rotate'}
                    onClick={() => setSectionBoxSubTool('rotate')}
                  />
                </RightToolbarGroup>
              )}

            </>
          ) : activeMode === 'measure' ? (
            <RightToolbarGroup>
              <RightToolbarButton src={measureDistanceIcon} label="Dimensions" shortcut="R" showTooltip={showTooltips} isActive={activeMeasureTool === 'dimensions'} onClick={() => setActiveMeasureTool('dimensions')} />
              <RightToolbarButton src={measurePointIcon} label="Point to Point" shortcut="P" showTooltip={showTooltips} isActive={activeMeasureTool === 'point-to-point'} onClick={() => setActiveMeasureTool('point-to-point')} />
              <RightToolbarButton src={measureAngleIcon} label="Laser" shortcut="L" showTooltip={showTooltips} isActive={activeMeasureTool === 'laser'} onClick={() => setActiveMeasureTool('laser')} />
              <RightToolbarButton src={measureAreaIcon} label="Manhole" shortcut="M" showTooltip={showTooltips} isActive={activeMeasureTool === 'manhole'} onClick={() => setActiveMeasureTool('manhole')} />
              <RightToolbarButton src={measureHeightIcon} label="Coordinates" shortcut="C" showTooltip={showTooltips} isActive={activeMeasureTool === 'coordinates'} onClick={() => setActiveMeasureTool('coordinates')} />
            </RightToolbarGroup>
          ) : (
            // markup mode (and create mode falls back here until its own tools are designed)
            <RightToolbarGroup>
              <RightToolbarButton src={markupSelectIcon} label="Select" shortcut="V" showTooltip={showTooltips} isActive={activeMarkupTool === 'select'} onClick={() => { setActiveMarkupTool('select'); adapter.setMarkupTool?.('select'); }} />
              <RightToolbarButton src={markupTextIcon} label="Text" shortcut="T" showTooltip={showTooltips} isActive={activeMarkupTool === 'text'} onClick={() => { setActiveMarkupTool('text'); adapter.setMarkupTool?.('text'); }} />
              <RightToolbarButton src={markupLineIcon} label="Line" shortcut="L" showTooltip={showTooltips} isActive={activeMarkupTool === 'line'} onClick={() => { setActiveMarkupTool('line'); adapter.setMarkupTool?.('line'); }} />
              <RightToolbarButton src={markupRectIcon} label="Shape" shortcut="R" showTooltip={showTooltips} isActive={activeMarkupTool === 'shape'} onClick={() => { setActiveMarkupTool('shape'); adapter.setMarkupTool?.('shape'); }} />
              <RightToolbarButton src={markupPenIcon} label="Freehand" shortcut="F" showTooltip={showTooltips} isActive={activeMarkupTool === 'freehand'} onClick={() => { setActiveMarkupTool('freehand'); adapter.setMarkupTool?.('freehand'); }} />
              <RightToolbarButton src={markupFreehandIcon} label="Callout" shortcut="B" showTooltip={showTooltips} isActive={activeMarkupTool === 'callout'} onClick={() => { setActiveMarkupTool('callout'); adapter.setMarkupTool?.('callout'); }} />
              <RightToolbarButton src={markupCalloutIcon} label="Highlighter" shortcut="H" showTooltip={showTooltips} isActive={activeMarkupTool === 'highlighter'} onClick={() => { setActiveMarkupTool('highlighter'); adapter.setMarkupTool?.('highlighter'); }} />
              <RightToolbarButton src={markupHighlighterIcon} label="Cloud" shortcut="C" showTooltip={showTooltips} isActive={activeMarkupTool === 'cloud'} onClick={() => { setActiveMarkupTool('cloud'); adapter.setMarkupTool?.('cloud'); }} />
            </RightToolbarGroup>
          )}

          {/* More-tools group — hidden, restore by removing the outer div */}
          <div style={{ display: 'none' }}><RightToolbarGroup>
            {activeMode !== 'measure' && activeMode !== 'sectioning' && (
              <div className="relative">
                <button
                  type="button"
                  aria-label="Color"
                  onClick={() => setShowColorPicker((o) => !o)}
                  className="mv-toolbar-button relative flex items-center justify-center rounded p-1.5 transition-colors hover:bg-[#E3E6E8]"
                >
                  <span className="block h-5 w-5 rounded-full" style={{ backgroundColor: markupColor }} />
                  {lowerGroupTooltips && (
                    <div className="mv-toolbar-tooltip mv-toolbar-tooltip-left" aria-hidden="true">
                      <span className="mv-toolbar-tooltip-shortcut">P</span>
                      <span className="mv-toolbar-tooltip-label">Color</span>
                    </div>
                  )}
                </button>
                {showColorPicker && (
                  <div className="absolute right-full top-0 mr-2 bg-white rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.2)] p-2 grid grid-cols-4 gap-1.5 z-[200]">
                    {['#FF0000', '#FF6600', '#FFCC00', '#00CC00', '#0066FF', '#9933FF', '#FF3399', '#000000', '#666666', '#FFFFFF', '#3CC654', '#2066DF'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setMarkupColor(c);
                          adapter.setMarkupColor?.(c);
                          setShowColorPicker(false);
                        }}
                        className={`w-6 h-6 rounded-full border-2 ${c === markupColor ? 'border-blue-500' : 'border-gray-200'} hover:scale-110 transition-transform`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="relative">
              <button
                type="button"
                aria-label="More tools"
                onClick={() => setIsOverflowOpen((open) => !open)}
                className={`mv-toolbar-button relative flex items-center justify-center rounded p-1.5 transition-colors ${isOverflowOpen ? 'bg-[#D2E0F9] hover:bg-[#BCD1F5]' : 'hover:bg-[#E3E6E8]'}`}
              >
                <MoreVertical size={24} className={isOverflowOpen ? 'text-[#2B5CE6]' : 'text-[#232729]'} />
                <svg
                  aria-hidden="true"
                  viewBox="0 0 8 8"
                  className="absolute bottom-0.5 left-0.5 h-2 w-2"
                >
                  <path d="M0 0L8 8H0V0Z" fill="#8b98a1" />
                </svg>
                {lowerGroupTooltips && (
                  <div className="mv-toolbar-tooltip mv-toolbar-tooltip-left" aria-hidden="true">
                    <span className="mv-toolbar-tooltip-label">More tools</span>
                  </div>
                )}
              </button>

              {isOverflowOpen && (
                <div
                  className="absolute right-full top-0 mr-2 z-[230] flex flex-col gap-2 w-max"
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    setShowFlyoutTooltips(true);
                    setShowTooltips(false);
                  }}
                  onMouseLeave={() => {
                    setShowFlyoutTooltips(false);
                    setShowTooltips(true);
                  }}
                >
                  <RightToolbarGroup>
                    <TopDefaultButtons showTooltip={showFlyoutTooltips} />
                  </RightToolbarGroup>
                  <RightToolbarGroup>
                    {overflowModeButtons.map((button) => (
                      <RightToolbarButton
                        key={button.id}
                        src={button.src}
                        label={button.label}
                        shortcut={button.shortcut}
                        showTooltip={showFlyoutTooltips}
                        onClick={() => {
                          setIsOverflowOpen(false);
                          button.enterMode();
                        }}
                      />
                    ))}
                  </RightToolbarGroup>
                </div>
              )}
            </div>
          </RightToolbarGroup></div>

          <RightToolbarGroup>
            <RightToolbarButton src={resetIcon} label="Reset" shortcut="Ctrl + R" showTooltip={lowerGroupTooltips} onClick={() => adapter.resetView()} />
            <RightToolbarButton src={undoIcon} label="Undo" shortcut="Ctrl + Z" showTooltip={lowerGroupTooltips} onClick={() => adapter.undo?.()} />
            <RightToolbarButton src={redoIcon} label="Redo" shortcut="Ctrl + Y" showTooltip={lowerGroupTooltips} onClick={() => adapter.redo?.()} />
          </RightToolbarGroup>
        </>
      )}
    </div>
  );
}

// ── Action History Flyout ──────────────────────────────────────────

type HistoryCategory = 'sectioning' | 'hidden' | 'isolate' | 'markups' | 'measurements';

function ActionHistoryPill({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-2 bg-[#2066DF] text-white text-[12px] font-semibold leading-[16px] tracking-[0.25px] rounded-full px-3 py-[4px] w-fit">
      <span className="whitespace-nowrap">{label}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="flex items-center justify-center hover:opacity-70 transition-opacity flex-shrink-0"
        aria-label={`Remove ${label}`}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 2L8 8M8 2L2 8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  );
}

function ActionHistoryFlyout({
  history,
  onClear,
  onClearAll,
}: {
  history: ActionHistorySummary;
  onClear: (category: HistoryCategory) => void;
  onClearAll: () => void;
}) {
  const visibilityItems: Array<{ key: HistoryCategory; label: string; count: number }> = [
    { key: 'sectioning', label: 'Sectioning', count: history.sectioningCount },
    { key: 'hidden', label: 'Hidden Objects', count: history.hiddenObjectsCount },
    { key: 'isolate', label: 'Isolate', count: history.isolateCount },
  ];
  const markupItems: Array<{ key: HistoryCategory; label: string; count: number }> = [
    { key: 'markups', label: 'Markups', count: history.markupsCount },
    { key: 'measurements', label: 'Measurements', count: history.measurementsCount },
  ];

  const visibleVisibility = visibilityItems.filter(i => i.count > 0);
  const visibleMarkups = markupItems.filter(i => i.count > 0);
  const hasAny = visibleVisibility.length > 0 || visibleMarkups.length > 0;

  return (
    <div className="bg-white rounded-l-lg rounded-br-lg shadow-[0_4px_12px_0_rgba(0,0,0,0.2)] flex flex-col min-w-[180px]">
      <div className="flex flex-col gap-3 px-2 py-3">
        {!hasAny && (
          <p className="text-[12px] leading-[16px] text-[#6C757D] text-center py-2">No actions to display</p>
        )}

        {visibleVisibility.length > 0 && (
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[12px] font-semibold leading-[16px] tracking-[0.25px] text-[#232729]">Visibility</span>
            <div className="flex flex-col gap-2 items-start">
              {visibleVisibility.map(item => (
                <ActionHistoryPill
                  key={item.key}
                  label={`${item.label} (${item.count})`}
                  onRemove={() => onClear(item.key)}
                />
              ))}
            </div>
          </div>
        )}

        {visibleMarkups.length > 0 && (
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[12px] font-semibold leading-[16px] tracking-[0.25px] text-[#232729]">Markups</span>
            <div className="flex flex-col gap-2 items-start">
              {visibleMarkups.map(item => (
                <ActionHistoryPill
                  key={item.key}
                  label={`${item.label} (${item.count})`}
                  onRemove={() => onClear(item.key)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {hasAny && (
        <div className="bg-[#EEF0F1] rounded-b-lg flex items-center justify-end px-2 py-2">
          <button
            type="button"
            onClick={onClearAll}
            className="flex items-center gap-1.5 px-2 py-1 text-[12px] leading-[16px] tracking-[0.25px] text-[#232729] hover:bg-[#D6DADC] rounded transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path fillRule="evenodd" clipRule="evenodd" d="M11.333 1.33337H5.33301V2.33337H1.33301V4.33337H2.83301L3.33301 15.3334H13.2421L13.833 4.33337H15.333V2.33337H11.333V1.33337ZM5.33301 5.33337H6.33301V13.3334H5.33301V5.33337ZM7.83301 5.33337H8.83301V13.3334H7.83301V5.33337ZM10.333 5.33337H11.333V13.3334H10.333V5.33337Z" fill="#232729" />
            </svg>
            Clear All
          </button>
        </div>
      )}
    </div>
  );
}
