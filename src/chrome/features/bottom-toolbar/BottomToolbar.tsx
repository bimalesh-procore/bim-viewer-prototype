import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useViewerAdapter } from '../viewer-adapter/ViewerAdapterContext';
import { useViewerSettings } from '../viewer-settings/ViewerSettingsContext';
import { useViewpoints } from '../viewpoints';
import { BottomToolbarButton } from './BottomToolbarButton';
import { BottomToolbarDivider } from './BottomToolbarDivider';
import { NavModeMenu, NAV_MODE_ICONS, type NavMode } from './NavModeMenu';

const NAV_MODE_LABEL: Record<NavMode, string> = {
  select: 'Default',
  orbit: 'Orbit',
  fly: 'Fly',
};
import { RenderSettingsFlyout } from './RenderSettingsFlyout';
import {
  RenderStyleMenu,
  RENDER_STYLE_OPTIONS,
  type RenderStyle,
} from './RenderStyleMenu';
import homeIcon from '../../assets/icons/navigation-wheel/home-icon.svg';
import orthographicIcon from '../../assets/icons/right-toolbar/orthographic.svg';
import perspectiveIcon from '../../assets/icons/right-toolbar/perspective.svg';
import renderModesIcon from '../../assets/icons/right-toolbar/render-modes.svg';
import xRayIcon from '../../assets/icons/right-toolbar/x-ray.svg';
import orbitCursor from '../../assets/cursors/orbit-cursor.svg';
import flyCursor from '../../assets/cursors/fly-cursor.svg';

type OpenFlyout = 'nav-mode' | 'render' | 'style' | null;
type ButtonId = 'home' | 'nav-mode' | 'ortho' | 'render' | 'xray';

function getInitialRenderStyle(): RenderStyle {
  if (typeof window === 'undefined') return 'default';
  const param = new URLSearchParams(window.location.search).get('style');
  return param === 'realism' ? 'realism' : 'default';
}

function writeRenderStyleToUrl(style: RenderStyle) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (style === 'default') params.delete('style');
  else params.set('style', style);
  const query = params.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', next);
}

export function BottomToolbar() {
  const adapter = useViewerAdapter();
  const { isOrthographic, isXRayActive, toggleOrthographic, toggleXRay } = useViewerSettings();
  const viewpoints = useViewpoints();

  const handleGoHome = async () => {
    const home = await viewpoints.getHomeView();
    if (home && adapter.setViewpointState) {
      adapter.setViewpointState(
        {
          camera: {
            position: home.cameraPosition,
            target:   home.cameraTarget,
            isOrthographic: home.isOrthographic,
          },
          hiddenObjects: home.hiddenObjects ?? [],
          sectioning:    home.sectioning ?? null,
        },
        { animate: true },
      );
      return;
    }
    adapter.fitToView();
  };

  const [activeMode, setActiveMode] = useState<NavMode>('select');
  const [openFlyout, setOpenFlyout] = useState<OpenFlyout>(null);
  const [hoveredId, setHoveredId] = useState<ButtonId | null>(null);
  const [renderStyle, setRenderStyle] = useState<RenderStyle>(getInitialRenderStyle);
  const rootRef = useRef<HTMLDivElement>(null);

  const handleSelectStyle = (style: RenderStyle) => {
    setRenderStyle(style);
    adapter.setRenderStyle?.(style);
    writeRenderStyleToUrl(style);
    setOpenFlyout(null);
  };

  // Apply the URL-derived style whenever the adapter changes. BottomToolbar
  // mounts with the mock adapter and switches to the real one once the viewer
  // is ready — depending on `adapter` (not []) ensures Realism actually gets
  // applied to the real adapter, not just logged by the mock.
  useEffect(() => {
    adapter.setRenderStyle?.(renderStyle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter]);

  const activeStyleOption =
    RENDER_STYLE_OPTIONS().find((o) => o.id === renderStyle) ?? RENDER_STYLE_OPTIONS()[0];

  const hoverHandlers = (id: ButtonId) => ({
    onMouseEnter: () => setHoveredId(id),
    onMouseLeave: () => setHoveredId((prev) => (prev === id ? null : prev)),
  });

  // Push cursor SVG to the adapter when nav mode changes — mirrors the
  // behavior the old NavigationWheel had.
  useEffect(() => {
    switch (activeMode) {
      case 'orbit':
        adapter.setCursorIcon?.(orbitCursor);
        break;
      case 'fly':
        adapter.setCursorIcon?.(flyCursor);
        break;
      case 'select':
      default:
        adapter.setCursorIcon?.(null);
        break;
    }
  }, [activeMode, adapter]);

  // Close any open flyout on outside click.
  useEffect(() => {
    if (!openFlyout) return;
    const handler = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpenFlyout(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openFlyout]);

  const handleSelectMode = (mode: NavMode) => {
    setActiveMode(mode);
    adapter.setInteractionMode?.(mode);
    setOpenFlyout(null);
  };

  const navModeIcons = NAV_MODE_ICONS();
  const activeNavIcon = navModeIcons[activeMode];

  return (
    <div
      ref={rootRef}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 w-max z-20"
    >
      <div
        className="flex items-center gap-2 bg-white rounded-full px-2 py-1.5"
        style={{ boxShadow: '0 0 4px 0 rgba(0,0,0,0.25)' }}
      >
        {/* Group 1 — Home + Nav mode */}
        <div className="flex items-center gap-1">
          <BottomToolbarButton
            src={homeIcon}
            label="Home"
            showTooltip={hoveredId === 'home' && openFlyout === null}
            onClick={handleGoHome}
            {...hoverHandlers('home')}
          />
          <div className="relative">
            <button
              type="button"
              aria-label="Navigation Mode"
              aria-haspopup="menu"
              aria-expanded={openFlyout === 'nav-mode'}
              onClick={() => setOpenFlyout((prev) => (prev === 'nav-mode' ? null : 'nav-mode'))}
              {...hoverHandlers('nav-mode')}
              className={`mv-toolbar-button relative flex items-center gap-1.5 rounded px-2 py-1 transition-colors ${
                openFlyout === 'nav-mode' || activeMode !== 'select'
                  ? 'bg-[#D2E0F9] hover:bg-[#BCD1F5]'
                  : 'hover:bg-[#E3E6E8]'
              }`}
            >
              <img src={activeNavIcon} alt="" width={20} height={20} aria-hidden="true" />
              <ChevronDown size={16} className="text-[#232729]" aria-hidden="true" />
              <div className="mv-toolbar-tooltip mv-toolbar-tooltip-top" aria-hidden="true">
                <span className="mv-toolbar-tooltip-label">Navigation Mode</span>
              </div>
            </button>
            {openFlyout === 'nav-mode' && (
              <NavModeMenu activeMode={activeMode} onSelect={handleSelectMode} />
            )}
          </div>
        </div>

        <BottomToolbarDivider />

        {/* Group 2 — View settings (synced with right toolbar) */}
        <div className="flex items-center gap-1">
          <BottomToolbarButton
            src={isOrthographic ? perspectiveIcon : orthographicIcon}
            label={isOrthographic ? 'Perspective' : 'Orthographic'}
            showTooltip={hoveredId === 'ortho' && openFlyout === null}
            isActive={isOrthographic}
            onClick={toggleOrthographic}
            {...hoverHandlers('ortho')}
          />
          <div className="relative">
            <button
              type="button"
              aria-label="Render Settings"
              aria-haspopup="menu"
              aria-expanded={openFlyout === 'render'}
              onClick={() => setOpenFlyout((prev) => (prev === 'render' ? null : 'render'))}
              {...hoverHandlers('render')}
              className={`mv-toolbar-button relative flex items-center gap-1 rounded p-1.5 transition-colors ${
                openFlyout === 'render' ? 'bg-[#D2E0F9] hover:bg-[#BCD1F5]' : 'hover:bg-[#E3E6E8]'
              }`}
            >
              <img src={renderModesIcon} alt="" width={24} height={24} aria-hidden="true" />
              <ChevronDown size={14} className="text-[#232729]" aria-hidden="true" />
              <div className="mv-toolbar-tooltip mv-toolbar-tooltip-top" aria-hidden="true">
                <span className="mv-toolbar-tooltip-label">Render Settings</span>
              </div>
            </button>
            {openFlyout === 'render' && <RenderSettingsFlyout />}
          </div>
          <BottomToolbarButton
            src={xRayIcon}
            label="Xray"
            shortcut="Cmd X"
            showTooltip={hoveredId === 'xray' && openFlyout === null}
            isActive={isXRayActive}
            onClick={toggleXRay}
            {...hoverHandlers('xray')}
          />
        </div>

        <BottomToolbarDivider />

        {/* Group 3 — Render style picker */}
        <div className="relative">
          <button
            type="button"
            aria-label="Render style"
            aria-haspopup="menu"
            aria-expanded={openFlyout === 'style'}
            onClick={() => setOpenFlyout((prev) => (prev === 'style' ? null : 'style'))}
            className={`mv-toolbar-button relative flex items-center gap-1.5 rounded px-2 py-1 transition-colors ${
              openFlyout === 'style' ? 'bg-[#D2E0F9] hover:bg-[#BCD1F5]' : 'hover:bg-[#E3E6E8]'
            }`}
          >
            <img src={activeStyleOption.icon} alt="" width={20} height={20} aria-hidden="true" />
            <span className="min-w-[56px] text-left text-[14px] leading-[20px] tracking-[0.15px] text-[#232729]">
              {activeStyleOption.label}
            </span>
            <ChevronDown size={16} className="text-[#232729]" aria-hidden="true" />
            <div className="mv-toolbar-tooltip mv-toolbar-tooltip-top" aria-hidden="true">
              <span className="mv-toolbar-tooltip-label">Render Mode</span>
            </div>
          </button>
          {openFlyout === 'style' && (
            <RenderStyleMenu activeStyle={renderStyle} onSelect={handleSelectStyle} />
          )}
        </div>
      </div>
    </div>
  );
}
