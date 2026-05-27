import { useCallback, useState } from 'react';

interface UseSettingsPanelResult {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

// Plain open/close state. The window is a floating dialog with its own
// close affordance and Escape handling — no click-outside dismissal.
export function useSettingsPanel(): UseSettingsPanelResult {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  return { isOpen, open, close, toggle };
}
