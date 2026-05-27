import { useMemo } from 'react';
import { FloatingWindow, type FloatingWindowPosition } from '../floating-window';
import { MeasurementSystemSection } from './sections/MeasurementSystemSection';
import { PerformanceSection } from './sections/PerformanceSection';
import { HomeViewSection } from './sections/HomeViewSection';

interface SettingsPanelDesktopProps {
  onClose: () => void;
  onUpdateHomeView: () => void;
  homeViewDisabled?: boolean;
}

const SETTINGS_WIDTH = 340;
// Gap between Settings and the right toolbar — mirrors the left-toolbar's
// inset-from-canvas-edge so the right side feels balanced with the left.
const GAP_FROM_RIGHT_TOOLBAR = 8;
// Fallback if the right toolbar isn't in the DOM yet (e.g. very first open).
// Approximates right-2 (8px) + toolbar width (~52px) + gap (8px).
const FALLBACK_RIGHT_INSET = 68;
const FALLBACK_TOP = 56;

function computeInitialPosition(): FloatingWindowPosition {
  if (typeof document === 'undefined') {
    return { x: 0, y: FALLBACK_TOP };
  }
  const rightToolbar = document.getElementById('right-toolbar');
  if (rightToolbar) {
    const rect = rightToolbar.getBoundingClientRect();
    return {
      x: Math.max(8, rect.left - SETTINGS_WIDTH - GAP_FROM_RIGHT_TOOLBAR),
      y: rect.top,
    };
  }
  return {
    x: Math.max(8, window.innerWidth - SETTINGS_WIDTH - FALLBACK_RIGHT_INSET),
    y: FALLBACK_TOP,
  };
}

export function SettingsPanelDesktop({ onClose, onUpdateHomeView, homeViewDisabled }: SettingsPanelDesktopProps) {
  // Compute once per open so the window doesn't jump if the toolbar resizes
  // while the window is mounted. Re-open recomputes.
  const initialPosition = useMemo(() => computeInitialPosition(), []);

  return (
    <FloatingWindow title="Settings" onClose={onClose} width={SETTINGS_WIDTH} initialPosition={initialPosition}>
      <div className="flex flex-col gap-4">
        <MeasurementSystemSection />
        <PerformanceSection />
        <HomeViewSection onUpdate={onUpdateHomeView} disabled={homeViewDisabled} />
      </div>
    </FloatingWindow>
  );
}
