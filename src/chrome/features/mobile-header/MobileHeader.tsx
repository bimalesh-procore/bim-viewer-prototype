import { useState } from 'react';
import closeIcon from '../../assets/icons/header/close.svg';
import settingsIcon from '../../assets/icons/header/settings.svg';
import searchIcon from '../../assets/icons/header/search.svg';
import moreIcon from '../../assets/icons/views/more.svg';
import type { HeaderProps } from '../header/types';
import { SettingsPanel, useSettingsPanel } from '../settings-panel';
import { useToast } from '../toast';
import { useViewpoints } from '../viewpoints';
import { useViewerAdapter } from '../viewer-adapter/ViewerAdapterContext';
import { DropdownMenu, DropdownMenuItem } from '../../shared/DropdownMenu';

export function MobileHeader({ models = [], activeModelId = null }: HeaderProps) {
  const settings = useSettingsPanel();
  const toast = useToast();
  const viewpoints = useViewpoints();
  const adapter = useViewerAdapter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreAnchorRect, setMoreAnchorRect] = useState<DOMRect | null>(null);

  const activeModel = models.find((m) => m.id === activeModelId) ?? null;
  const modelLabel = activeModel?.label ?? 'Model Name';

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
      cameraTarget: state.camera.target,
      isOrthographic: state.camera.isOrthographic,
      hiddenObjects: state.hiddenObjects,
      sectioning: state.sectioning,
      markups: [],
      createdAt: Date.now(),
    });
    if (result.ok) {
      toast.show({ kind: 'success', message: 'The home view was successfully updated.' });
      return;
    }
    if (result.reason === 'writer-unavailable') {
      toast.show({
        kind: 'error',
        message: 'Saving a home view is only available when running locally.',
        duration: 5000,
      });
      return;
    }
    toast.show({ kind: 'error', message: 'Could not save the home view. Try again.' });
  };

  return (
    <header className="h-12 px-3 py-2 bg-[rgba(255,255,255,0.2)] backdrop-blur-[2px] flex items-center gap-2 shadow-[0_4px_4px_0_rgba(0,0,0,0.05)]">
      <button
        type="button"
        aria-label="Close"
        onClick={() => { window.location.href = window.location.pathname; }}
        className="h-8 w-8 rounded-[8px] bg-white flex items-center justify-center hover:bg-gray-100 transition-colors shrink-0"
      >
        <img src={closeIcon} alt="" width={20} height={20} className="block" />
      </button>

      <div className="h-8 min-w-0 max-w-[320px] bg-white rounded-[8px] px-3 flex items-center">
        <span className="text-[#171a1c] text-[20px] leading-6 font-semibold truncate">{modelLabel}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={settings.toggle}
          aria-label="Settings"
          className="h-8 w-8 rounded-[8px] bg-white flex items-center justify-center hover:bg-gray-100 transition-colors"
        >
          <img src={settingsIcon} alt="" width={20} height={20} className="block" />
        </button>

        <button
          type="button"
          aria-label="Search"
          onClick={() => window.dispatchEvent(new CustomEvent('mv:toggle-global-search'))}
          className="h-8 w-8 rounded-[8px] bg-white flex items-center justify-center hover:bg-gray-100 transition-colors"
        >
          <img src={searchIcon} alt="" width={20} height={20} className="block" />
        </button>

        <button
          type="button"
          aria-label="More"
          onClick={(e) => {
            setMoreAnchorRect(e.currentTarget.getBoundingClientRect());
            setMoreOpen((v) => !v);
          }}
          className="h-8 w-8 rounded-[8px] bg-white flex items-center justify-center hover:bg-gray-100 transition-colors"
        >
          <img src={moreIcon} alt="" width={16} height={16} className="block" />
        </button>
      </div>

      {moreOpen && moreAnchorRect && (
        <DropdownMenu
          position={{ x: moreAnchorRect.right, y: moreAnchorRect.bottom + 4 }}
          onClose={() => setMoreOpen(false)}
        >
          <DropdownMenuItem
            onClick={() => {
              void handleUpdateHomeView();
              setMoreOpen(false);
            }}
          >
            Update Home View
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              window.dispatchEvent(new CustomEvent('mv:toggle-global-search'));
              setMoreOpen(false);
            }}
          >
            Open Search
          </DropdownMenuItem>
        </DropdownMenu>
      )}

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
