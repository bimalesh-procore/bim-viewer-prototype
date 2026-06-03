import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import phoneIcon from '../../assets/icons/header/phone.svg';
import { HeaderButton } from './HeaderButton';
import { HeaderSearch } from './HeaderSearch';
import type { HeaderProps } from './types';
import { FormFactorMenu } from '../form-factor-menu';
import { SettingsPanel, useSettingsPanel } from '../settings-panel';
import { useToast } from '../toast';
import { useViewpoints } from '../viewpoints';
import { useViewerAdapter } from '../viewer-adapter/ViewerAdapterContext';
import arrowLeftIcon from '../../assets/icons/header/arrow-left.svg';
import arrowRightIcon from '../../assets/icons/header/arrow-right.svg';
import caretDownIcon from '../../assets/icons/header/caret-down.svg';
import settingsIcon from '../../assets/icons/header/settings.svg';
import infoIcon from '../../assets/icons/header/info.svg';
import closeIcon from '../../assets/icons/header/close.svg';
import procoreEmblem from '../../assets/icons/header/procoreEmblem.png';

export function HeaderDesktop({ models = [], activeModelId = null, onSelectModel }: HeaderProps) {
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const [formFactorMenuOpen, setFormFactorMenuOpen] = useState(false);
  const formFactorMenuRef = useRef<HTMLDivElement>(null);
  const formFactorAnchorRef = useRef<HTMLButtonElement>(null);
  const settings = useSettingsPanel();
  const toast = useToast();
  const viewpoints = useViewpoints();
  const adapter = useViewerAdapter();

  const handleUpdateHomeView = async () => {
    const state = adapter.getViewpointState?.();
    if (!state) {
      toast.show({ kind: 'error', message: 'Could not capture current view.' });
      settings.close();
      return;
    }
    if (!viewpoints.activeModelId) {
      toast.show({ kind: 'error', message: 'Load a model before setting a home view.' });
      settings.close();
      return;
    }
    settings.close();
    const result = await viewpoints.setHomeView({
      id: `home-${Date.now()}`,
      name: 'Home',
      cameraPosition: state.camera.position,
      cameraTarget:   state.camera.target,
      isOrthographic: state.camera.isOrthographic,
      hiddenObjects:  state.hiddenObjects,
      sectioning:     state.sectioning,
      markups: [],
      createdAt: Date.now(),
    });
    if (result.ok) {
      toast.show({ kind: 'success', message: 'The home view was successfully updated.' });
      return;
    }
    if (result.reason === 'writer-unavailable') {
      // Saves require the dev server's writer middleware; in a Vercel build
      // the endpoint doesn't exist.
      toast.show({
        kind: 'error',
        message: 'Saving a home view is only available when running locally.',
        duration: 5000,
      });
      return;
    }
    toast.show({ kind: 'error', message: 'Could not save the home view. Try again.' });
  };

  useEffect(() => {
    if (!modelMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!modelMenuRef.current?.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [modelMenuOpen]);

  useEffect(() => {
    if (!formFactorMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (formFactorMenuRef.current?.contains(target)) return;
      if (formFactorAnchorRef.current?.contains(target)) return;
      setFormFactorMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [formFactorMenuOpen]);

  const activeModel = models.find((m) => m.id === activeModelId) ?? null;
  const buttonLabel = activeModel?.label ?? 'Project Model';
  const hasMenu = models.length > 0 && !!onSelectModel;

  const currentIndex = models.findIndex((m) => m.id === activeModelId);

  const handlePrev = () => {
    if (!hasMenu) return;
    const prevIndex = currentIndex <= 0 ? models.length - 1 : currentIndex - 1;
    onSelectModel?.(models[prevIndex]);
  };

  const handleNext = () => {
    if (!hasMenu) return;
    const nextIndex = currentIndex >= models.length - 1 ? 0 : currentIndex + 1;
    onSelectModel?.(models[nextIndex]);
  };

  return (
    <header className="flex items-center justify-between h-12 pl-1.5 bg-white shadow-[0_2px_6px_0_rgba(0,0,0,0.1)] flex-shrink-0 z-30">
      {/* Left section: Procore logo + nav buttons + project dropdown in a shared pill */}
      <div className="flex items-center gap-0">
        <img src={procoreEmblem} alt="Procore" width={24} height={24} className="flex-shrink-0" style={{ marginLeft: 14, marginRight: 22 }} />
        <div ref={modelMenuRef} className="relative">
          <div className="flex items-center gap-0.5 bg-[#f6f6f6] rounded overflow-hidden">
            <div className="flex items-center gap-1 px-1.5">
              <HeaderButton src={arrowLeftIcon} label="Back" variant="secondary" onClick={handlePrev} />
              <HeaderButton src={arrowRightIcon} label="Forward" variant="secondary" onClick={handleNext} />
            </div>
            <button
              type="button"
              onClick={() => hasMenu && setModelMenuOpen((v) => !v)}
              aria-haspopup={hasMenu ? 'menu' : undefined}
              aria-expanded={hasMenu ? modelMenuOpen : undefined}
              className="flex items-center justify-between w-[213px] bg-[#f6f6f6] rounded-r p-1.5 h-full hover:bg-gray-200 transition-colors"
            >
              <span className="px-1.5 py-0.5 text-sm font-semibold text-[#232729] tracking-[0.15px] truncate text-left">
                {buttonLabel}
              </span>
              <img src={caretDownIcon} alt="" width={24} height={24} className={`block flex-shrink-0 transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {modelMenuOpen && hasMenu && (
            <div
              role="menu"
              className="absolute top-full left-16 mt-1 min-w-[213px] bg-white rounded-md shadow-lg border border-gray-200 py-1 z-40"
            >
              {models.map((model) => {
                const isActive = model.id === activeModelId;
                // Native <a> with href so the browser handles navigation at
                // the page level. This is the only reliable way to switch
                // models while web-ifc is mid-parse: that phase is a fully
                // synchronous main-thread block, so JS-driven location
                // changes can't fire until parsing finishes — but a real
                // anchor click is queued at the browser level and resolves
                // as soon as the click is processed, no matter what the
                // renderer thread is doing.
                // Preserve other URL params (form, orient, etc.) so the
                // active form factor isn't lost on model switch.
                const params = new URLSearchParams(window.location.search);
                params.set('model', model.id);
                const href = `?${params.toString()}`;
                return (
                  <a
                    key={model.id}
                    role="menuitem"
                    href={href}
                    onClick={(e) => {
                      // No-op for the active model — let the menu close
                      // without a redundant reload.
                      if (isActive) {
                        e.preventDefault();
                      } else {
                        // Optional callback so the host app can react
                        // (e.g. analytics). Browser navigation continues.
                        onSelectModel?.(model);
                      }
                      setModelMenuOpen(false);
                    }}
                    className="flex items-center justify-between w-full gap-3 px-3 py-2 text-sm text-[#232729] hover:bg-gray-100 transition-colors text-left no-underline"
                  >
                    <span className="font-medium truncate">{model.label}</span>
                    {isActive && <Check size={16} className="text-[#2066DF] flex-shrink-0" />}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Center section */}
      <HeaderSearch />

      {/* Right section */}
      <div className="flex items-center gap-3 pr-3">
        <div className="flex items-center gap-1.5">
          {/* Device-preview button — the only place form factor is changed.
              Lives next to the cog so designers can flip the prototype
              between desktop/tablet/phone without touching the URL bar. */}
          <div className="relative">
            <button
              ref={formFactorAnchorRef}
              type="button"
              onClick={() => setFormFactorMenuOpen((v) => !v)}
              aria-label="Device preview"
              aria-haspopup="menu"
              aria-expanded={formFactorMenuOpen}
              className="flex items-center justify-center rounded p-1 transition-colors hover:bg-gray-200 active:bg-gray-300"
            >
              <img src={phoneIcon} alt="" className="w-5 h-5" />
            </button>
            {formFactorMenuOpen && (
              <div ref={formFactorMenuRef} className="absolute top-full right-0 mt-1 z-40">
                <FormFactorMenu onSelect={() => setFormFactorMenuOpen(false)} />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={settings.toggle}
            aria-label="Settings"
            aria-haspopup="dialog"
            aria-expanded={settings.isOpen}
            className="flex items-center justify-center rounded p-1 transition-colors hover:bg-gray-200 active:bg-gray-300"
          >
            <img src={settingsIcon} alt="" width={24} height={24} className="block" />
          </button>
          <HeaderButton src={infoIcon} label="Info" iconSize={24} />
        </div>
        <div className="w-px h-12 bg-[#e3e6e8]" />
        <HeaderButton src={closeIcon} label="Close" iconSize={24} onClick={() => { window.location.href = window.location.pathname; }} />
      </div>
      {/* Settings window is a free-floating dialog, not anchored to the cog,
          so render it as a sibling of the header. */}
      {settings.isOpen && (
        <SettingsPanel
          onClose={settings.close}
          onUpdateHomeView={handleUpdateHomeView}
          homeViewDisabled={!viewpoints.activeModelId}
        />
      )}
    </header>
  );
}
