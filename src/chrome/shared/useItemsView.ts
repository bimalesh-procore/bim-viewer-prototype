import { useSyncExternalStore } from 'react';
import type { ItemsView } from '../features/items-panel/types';

// Module-level state — shared between ItemsContent (writer) and DockManager
// (reader, so it can render the correct outer-panel title/back-arrow).
// Lives in shared/ rather than items-panel/ so DockManager can import it
// without creating a cross-feature dependency.
let currentView: ItemsView = { kind: 'hub' };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ItemsView {
  return currentView;
}

export function useItemsView(): ItemsView {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setItemsView(next: ItemsView): void {
  currentView = next;
  emit();
}

export function goBackItemsView(): void {
  if (currentView.kind === 'asset-detail') {
    currentView = { kind: 'assets-list' };
  } else if (currentView.kind === 'assets-list') {
    currentView = { kind: 'hub' };
  } else if (currentView.kind === 'category-placeholder') {
    currentView = { kind: 'hub' };
  } else {
    return;
  }
  emit();
}

export function resetItemsView(): void {
  if (currentView.kind === 'hub') return;
  currentView = { kind: 'hub' };
  emit();
}
