import { useSyncExternalStore } from 'react';
import type { ParsedImportFile } from '../features/search-sets/xmlParser';

/**
 * View state for the Search Sets panel.
 *
 * - `list`   — default; shows existing search sets (or the empty-state CTA).
 * - `import` — shows the Navisworks-XML import screen with checkbox tree.
 *
 * Lives in `shared/` so DockManager can read the view kind (to set the
 * panel title, hide the orange + button, expose a back arrow) without
 * cross-importing from the search-sets feature directory.
 */
export type SearchSetsView =
  | { kind: 'list' }
  | { kind: 'import'; file: ParsedImportFile };

let currentView: SearchSetsView = { kind: 'list' };
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

function getSnapshot(): SearchSetsView {
  return currentView;
}

export function useSearchSetsView(): SearchSetsView {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setSearchSetsView(next: SearchSetsView): void {
  currentView = next;
  emit();
}

export function resetSearchSetsView(): void {
  if (currentView.kind === 'list') return;
  currentView = { kind: 'list' };
  emit();
}

// ── Search query — shared between SearchSetsToolbar and SearchSetsListView ────

let currentQuery = '';
const queryListeners = new Set<() => void>();

function emitQuery() {
  queryListeners.forEach((l) => l());
}

export function useSearchSetsQuery(): string {
  return useSyncExternalStore(
    (l) => { queryListeners.add(l); return () => queryListeners.delete(l); },
    () => currentQuery,
    () => currentQuery,
  );
}

export function setSearchSetsQuery(q: string): void {
  if (currentQuery === q) return;
  currentQuery = q;
  emitQuery();
}
