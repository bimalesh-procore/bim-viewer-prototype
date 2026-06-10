import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactElement } from 'react';
import { DropdownMenu, DropdownMenuItem } from '../../shared/DropdownMenu';
import {
  MoreVertical,
  ChevronRight,
  ChevronDown,
  Check,
  Star,
  X,
} from 'lucide-react';
import itemsAssetIcon           from '../../assets/icons/items/asset.svg';
import itemsCoordIssueIcon      from '../../assets/icons/items/coordination-issue.svg';
import itemsInspectionIcon      from '../../assets/icons/items/inspection.svg';
import itemsObservationIcon     from '../../assets/icons/items/observation.svg';
import itemsPunchListIcon       from '../../assets/icons/items/punch-list.svg';
import itemsRfiIcon             from '../../assets/icons/items/rfi.svg';
import itemsSubmittalIcon       from '../../assets/icons/items/submittal.svg';
import itemsArrowIcon          from '../../assets/icons/items/arrow.svg';
import { AssetsListView } from '../items-panel/AssetsListView';
import { AssetDetailView } from '../items-panel/AssetDetailView';
import type { Asset } from '../items-panel/types';
import { useItemsView, setItemsView } from '../../shared/useItemsView';
import editIcon from '../../assets/icons/views/edit.svg';
import shareIcon from '../../assets/icons/views/share.svg';
import moreIcon from '../../assets/icons/views/more.svg';
import { useViewerAdapter } from '../viewer-adapter/ViewerAdapterContext';
import type { SearchSet, ViewData, PropertyGroup, ObjectProperty } from '../viewer-adapter/types';
import { TreeNode } from '../../shared/TreeNode';
import type { PanelId } from './useDockStore';
import { useViewpoints } from '../viewpoints';
import type { Viewpoint, ViewpointFolder } from '../viewpoints';
import { useViewerSettings } from '../viewer-settings/ViewerSettingsContext';
import type { RenderToggles } from '../viewer-settings/types';
import { useToast } from '../toast/ToastContext';
import { parseSearchSetsXml, XmlParseError } from '../search-sets/xmlParser';
import type { ParsedImportFile, ParsedSearchSet, ParsedNode } from '../search-sets/xmlParser';
import { collectLeafSets, collectLeafGuids } from '../search-sets/xmlParser';
import { useSearchSetsView, setSearchSetsView, resetSearchSetsView, useSearchSetsQuery, setSearchSetsQuery } from '../../shared/useSearchSetsView';
import searchFieldIcon from '../../assets/icons/panel/searchField.svg';
import filterButtonIcon from '../../assets/icons/panel/filterButton.svg';
import hideIcon from '../../assets/icons/panel/hide.svg';
import showIcon from '../../assets/icons/panel/show.svg';
import propertiesEmptyIllustration from '../../assets/icons/panel/properties-empty.svg';
import searchSetsEmptyIllustration from '../../assets/icons/panel/search-sets-empty.png';
import caretDownIcon from '../../assets/icons/header/caret-down.svg';
import searchFieldFigmaIcon from '../../assets/icons/panel/searchField-figma.svg';
import folderIconSrc from '../../assets/icons/shared/folder.svg';

export type PropertiesTabId = 'all-properties' | 'related-items';

function PanelSearchBar({
  value,
  onChange,
  placeholder,
  onFilter,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onFilter?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex items-center flex-1 h-7 rounded bg-[#EEF0F1] pl-3 pr-2 gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent text-sm text-[#111827] placeholder-[#6B7785] outline-none"
        />
        <img src={searchFieldIcon} alt="" width={24} height={24} className="shrink-0" />
      </div>
      {onFilter && (
        <button
          type="button"
          aria-label="Filter"
          onClick={onFilter}
          className="w-6 h-6 flex items-center justify-center rounded shrink-0 hover:bg-black/5"
        >
          <img src={filterButtonIcon} alt="" width={16} height={16} />
        </button>
      )}
    </div>
  );
}

// ─── Search Sets ─────────────────────────────────────────────────────────────

function SearchSetsToolbar() {
  const query = useSearchSetsQuery();
  return (
    <div className="flex flex-wrap items-center gap-2 bg-white border-b border-[#D6DADC] px-4 py-2 w-full">
      <div className="flex items-center flex-1 h-7 min-w-[256px] overflow-hidden rounded bg-[#EEF0F1] pl-3 pr-2 gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setSearchSetsQuery(e.target.value)}
          placeholder="Search by name"
          className="flex-1 min-w-0 bg-transparent text-sm leading-5 tracking-[0.15px] text-[#232729] placeholder-[#6A767C] outline-none"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearchSetsQuery('')}
            className="flex items-center justify-center p-1 rounded shrink-0 text-[#6A767C] hover:text-[#232729]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
        <button
          type="button"
          aria-label="Search"
          className="flex items-center justify-end p-1 rounded shrink-0"
        >
          <div className="relative shrink-0 size-4">
            <div className="absolute inset-[10.41%_9.55%_9.55%_10.41%]">
              <img src={searchFieldFigmaIcon} alt="" className="absolute block inset-0 max-w-none size-full" />
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Import Search Sets view ────────────────────────────────────────────────
//
// Activated when the user picks an XML file from the Import / + dropdowns.
// Renders a Navisworks-style two-level tree: root folder = the imported file,
// children = each parsed <selectionset>. Footer holds the orange Import
// button which commits the checked sets via adapter.saveSearchSet.

function ImportSearchSetsView({
  file,
  isImporting,
  onCancel,
  onImport,
}: {
  file: ParsedImportFile;
  isImporting: boolean;
  onCancel: () => void;
  onImport: (sets: { guid: string; name: string; conditions: ParsedSearchSet['conditions']; folderPath: string[] }[]) => void;
}) {
  // Pre-expand all folders present in the parsed tree.
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    function collectFolderIds(nodes: ParsedNode[]) {
      for (const n of nodes) {
        if (n.type === 'folder') {
          ids.add(n.guid);
          collectFolderIds(n.children);
        }
      }
    }
    collectFolderIds(file.children);
    return ids;
  });

  // Nothing selected by default — the user opts in to what they want to import.
  const [checkedGuids, setCheckedGuids] = useState<Set<string>>(() => new Set());

  const query = useSearchSetsQuery();

  const allLeafSets = useMemo(() => collectLeafSets(file.children), [file]);
  const allLeafGuids = useMemo(() => allLeafSets.map((s) => s.guid), [allLeafSets]);

  // visibleNodes must be declared before filteredNodes (which depends on it).
  const visibleNodes = useMemo(() => {
    // Strip a single synthetic root folder only when its children themselves
    // contain at least one sub-folder — that indicates it's a namespace wrapper
    // (e.g. "Duplex Apartment - Search Sets" → By Level / By Element Type / …).
    // When the root's children are all leaf sets (flat list), keep the folder
    // so the user sees the grouping (e.g. "Sample Search Sets" with 4 sets inside).
    if (file.children.length === 1 && file.children[0]?.type === 'folder') {
      const rootChildren = file.children[0].children;
      const hasSubFolder = rootChildren.some((n) => n.type === 'folder');
      if (hasSubFolder) return rootChildren;
    }
    return file.children;
  }, [file]);

  // When the toolbar search query is active, prune tree to only branches that
  // contain at least one matching leaf. Returns null when no query is active.
  const filteredNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null; // null = show full tree

    function pruneNodes(nodes: ParsedNode[]): ParsedNode[] {
      const result: ParsedNode[] = [];
      for (const node of nodes) {
        if (node.type === 'set') {
          if (node.name.toLowerCase().includes(q)) result.push(node);
        } else {
          const prunedChildren = pruneNodes(node.children);
          if (prunedChildren.length > 0) {
            result.push({ ...node, children: prunedChildren });
          }
        }
      }
      return result;
    }
    return pruneNodes(visibleNodes);
  }, [visibleNodes, query]);

  // When a search query is active, only the visible (filtered) leaves are in scope
  // for Select All / deselect-all and the checked/indeterminate state of the header checkbox.
  const activeLeafGuids = useMemo(
    () => (filteredNodes !== null ? collectLeafGuids(filteredNodes) : allLeafGuids),
    [filteredNodes, allLeafGuids],
  );

  const allChecked = activeLeafGuids.length > 0 && activeLeafGuids.every((g) => checkedGuids.has(g));
  const someChecked = activeLeafGuids.some((g) => checkedGuids.has(g));
  const masterState: 'unchecked' | 'checked' | 'indeterminate' = allChecked
    ? 'checked'
    : someChecked
      ? 'indeterminate'
      : 'unchecked';

  const totalChecked = checkedGuids.size;

  const toggleSet = useCallback((guid: string, checked: boolean) => {
    setCheckedGuids((prev) => {
      const next = new Set(prev);
      checked ? next.add(guid) : next.delete(guid);
      return next;
    });
  }, []);

  const toggleAll = () => {
    if (someChecked) {
      // Deselect only the visible ones; keep any checked items outside the filter.
      setCheckedGuids((prev) => {
        const next = new Set(prev);
        activeLeafGuids.forEach((g) => next.delete(g));
        return next;
      });
    } else {
      setCheckedGuids((prev) => {
        const next = new Set(prev);
        activeLeafGuids.forEach((g) => next.add(g));
        return next;
      });
    }
  };

  // Toggle all leaf descendants of a folder node.
  const toggleFolderCheck = useCallback((guid: string, checked: boolean) => {
    function findNode(nodes: ParsedNode[]): ParsedNode | null {
      for (const n of nodes) {
        if (n.guid === guid) return n;
        if (n.type === 'folder') {
          const found = findNode(n.children);
          if (found) return found;
        }
      }
      return null;
    }
    const node = findNode(file.children);
    const leafGuids = node ? collectLeafGuids(node.type === 'folder' ? node.children : [node]) : [];
    setCheckedGuids((prev) => {
      const next = new Set(prev);
      leafGuids.forEach((g) => (checked ? next.add(g) : next.delete(g)));
      return next;
    });
  }, [file]);

  const toggleFolderExpand = useCallback((guid: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(guid) ? next.delete(guid) : next.add(guid);
      return next;
    });
  }, []);

  // Build a map from leaf guid → folder path (array of ancestor folder names)
  // using visibleNodes as the root so paths match what the user sees in the tree.
  const folderPathMap = useMemo(() => {
    function walk(nodes: ParsedNode[], path: string[]): Map<string, string[]> {
      const map = new Map<string, string[]>();
      for (const n of nodes) {
        if (n.type === 'set') {
          map.set(n.guid, path);
        } else {
          for (const [k, v] of walk(n.children, [...path, n.name])) map.set(k, v);
        }
      }
      return map;
    }
    return walk(visibleNodes, []);
  }, [visibleNodes]);

  const handleImport = () => {
    const sets = allLeafSets
      .filter((s) => checkedGuids.has(s.guid))
      .map((s) => ({
        guid: s.guid,
        name: s.name,
        conditions: s.conditions,
        folderPath: folderPathMap.get(s.guid) ?? [],
      }));
    if (sets.length === 0) return;
    // Duplicate check + animation are owned by SearchSetsContent; call synchronously.
    onImport(sets);
  };

  // Recursively render the node tree, preserving folder nesting from the XML.
  // forceExpand=true keeps all folders open (used during search).
  function renderNodes(nodes: ParsedNode[], depth: number, forceExpand = false): React.ReactNode {
    return nodes.map((node) => {
      if (node.type === 'set') {
        return (
          <TreeNode
            key={node.guid}
            id={node.guid}
            label={node.name}
            depth={depth}
            type="leaf"
            checked={checkedGuids.has(node.guid)}
            onCheckedChange={toggleSet}
            hoverBg="#F4F5F6"
          />
        );
      }
      // node.children are already pruned when renderNodes is called with filteredNodes,
      // so leafGuids here only covers the visible leaves — correct for check/indeterminate
      // state and for toggling (no need to search the full tree via toggleFolderCheck).
      const leafGuids = collectLeafGuids(node.children);
      const folderAllChecked = leafGuids.length > 0 && leafGuids.every((g) => checkedGuids.has(g));
      const folderSomeChecked = leafGuids.some((g) => checkedGuids.has(g));
      const isExpanded = forceExpand || expandedFolders.has(node.guid);
      const handleFolderCheck = (_guid: string, checked: boolean) => {
        setCheckedGuids((prev) => {
          const next = new Set(prev);
          leafGuids.forEach((g) => (checked ? next.add(g) : next.delete(g)));
          return next;
        });
      };
      return (
        <TreeNode
          key={node.guid}
          id={node.guid}
          label={node.name}
          depth={depth}
          type="folder"
          expanded={isExpanded}
          onToggle={() => toggleFolderExpand(node.guid)}
          checked={folderAllChecked}
          indeterminate={folderSomeChecked && !folderAllChecked}
          onCheckedChange={handleFolderCheck}
          hoverBg="#F4F5F6"
        >
          {renderNodes(node.children, depth + 1, forceExpand)}
        </TreeNode>
      );
    });
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {isImporting ? (
        /* ── Loading state ─────────────────────────────────────────────── */
        <div className="flex-1 flex flex-col items-center justify-center px-12">
          <div className="flex flex-col gap-2 w-full">
            <span className="text-[12px] leading-[16px] tracking-[0.25px] font-semibold text-black">
              Importing Search sets
            </span>
            {/* Animated progress bar — striped blue, matching Figma */}
            <div className="w-full h-[6px] rounded-full bg-[#D6DADC] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#2066DF] origin-left"
                style={{ animation: 'ss-progress 1.5s ease-in-out forwards' }}
              />
            </div>
          </div>
          <style>{`
            @keyframes ss-progress {
              from { width: 0%; }
              to   { width: 100%; }
            }
          `}</style>
        </div>
      ) : (
        <>
          {/* Bulk actions row */}
          <div className="flex items-center justify-between px-4 h-10 shadow-[0_1px_0_#dcdcdc] shrink-0 bg-white">
            <div className="flex items-center gap-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={masterState === 'indeterminate' ? 'mixed' : masterState === 'checked'}
                aria-label="Select all"
                disabled={allLeafGuids.length === 0}
                onClick={toggleAll}
                className={`shrink-0 size-5 rounded-[2px] flex items-center justify-center transition-colors ${
                  masterState === 'unchecked'
                    ? 'bg-white border-2 border-[#6A767C]'
                    : 'bg-[#2066DF]'
                } ${allLeafGuids.length === 0 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {masterState === 'checked' && (
                  <Check size={14} strokeWidth={3} className="text-white" />
                )}
                {masterState === 'indeterminate' && (
                  <span className="block w-[10px] h-[2px] bg-white" />
                )}
              </button>
              <button
                type="button"
                aria-label="Bulk actions"
                className="w-6 h-6 flex items-center justify-center rounded shrink-0 hover:bg-black/5"
              >
                <ChevronDown className="text-[#6A767C]" />
              </button>
            </div>
            <span className="text-[12px] leading-[16px] tracking-[0.25px] text-[#232729]">
              {totalChecked > 0
                ? `${totalChecked} of ${allLeafGuids.length} selected`
                : `${allLeafGuids.length} ${allLeafGuids.length === 1 ? 'Item' : 'Items'}`}
            </span>
          </div>

          {/* Tree — pruned to matching branches when searching, full tree otherwise. */}
          <div className="flex-1 overflow-y-auto bg-white">
            {filteredNodes !== null ? (
              filteredNodes.length === 0 ? (
                <p className="px-4 py-6 text-sm text-[#6A767C] text-center">No sets match "{query}".</p>
              ) : (
                renderNodes(filteredNodes, 0, true)
              )
            ) : (
              renderNodes(visibleNodes, 0)
            )}
          </div>
        </>
      )}

      {/* Footer — always visible; Import button shows spinner while loading */}
      <div className="flex items-center justify-end gap-2 bg-white px-4 py-2 shrink-0">
        {!isImporting && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 h-7 rounded text-sm font-semibold text-[#232729] hover:bg-black/5"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleImport}
          disabled={totalChecked === 0 || isImporting}
          className="px-3 h-7 rounded text-sm font-semibold text-white bg-[#FF5100] hover:bg-[#E64900] disabled:bg-[#E3E6E8] disabled:text-[#9DA7AD] disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
        >
          {isImporting ? (
            <>
              <svg
                className="animate-spin"
                width={14} height={14}
                viewBox="0 0 14 14"
                fill="none"
              >
                <circle cx="7" cy="7" r="5.5" stroke="white" strokeOpacity="0.4" strokeWidth="2" />
                <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Import
            </>
          ) : 'Import'}
        </button>
      </div>
    </div>
  );
}

// ── Delete confirmation modal ────────────────────────────────────────────────

function DeleteConfirmModal({
  count,
  name,
  isFolder = false,
  onCancel,
  onConfirm,
}: {
  count: number;
  /** When deleting a single set, its name — drives the header + singular body copy. */
  name?: string;
  /** When deleting a folder, use folder-specific copy (name + nested-group count). */
  isFolder?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const single = count === 1;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(35,39,41,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="bg-white rounded-[4px] w-[480px] flex flex-col overflow-hidden"
        style={{ boxShadow: '0px 8px 32px -4px rgba(35,39,41,0.8)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-8 pt-6 pb-5 shrink-0">
          <h2 className="flex-1 text-[20px] font-semibold leading-7 tracking-[0.15px] text-[#232729]">
            {isFolder
              ? count === 0
                ? `Delete ${name}?`
                : `Delete ${name} with ${count} Search ${single ? 'Group' : 'Groups'}?`
              : single && name
                ? `Delete ${name}?`
                : `Delete ${count} Search Groups?`}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onCancel}
            className="w-9 h-9 flex items-center justify-center rounded hover:bg-[#F4F5F6] text-[#232729] shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M1 1L15 15M15 1L1 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-8 pb-6 text-[14px] leading-5 tracking-[0.15px] text-[#232729]">
          {isFolder
            ? count === 0
              ? 'This will remove the folder from the project for all users. The action cannot be undone.'
              : 'This will remove the folder and any nested folders and search groups within the folder from the project for all users. The action cannot be undone.'
            : single
              ? 'This will remove the search group from the project for all users. The action cannot be undone.'
              : `This will remove ${count} search groups from the project for all users. The action cannot be undone.`}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-8 pt-6 pb-8 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-[5px] rounded text-[14px] font-semibold leading-5 tracking-[0.15px] text-[#232729] hover:bg-[#F4F5F6] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-[5px] rounded text-[14px] font-semibold leading-5 tracking-[0.15px] text-white bg-[#FF5100] hover:bg-[#E64900] transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Duplicate import confirmation modal ─────────────────────────────────────

function DuplicateImportModal({
  duplicateCount,
  onCancel,
  onConfirm,
}: {
  duplicateCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(35,39,41,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="bg-white rounded-[4px] w-[480px] flex flex-col overflow-hidden"
        style={{ boxShadow: '0px 8px 32px -4px rgba(35,39,41,0.8)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-8 pt-6 pb-5 shrink-0">
          <h2 className="flex-1 text-[20px] font-semibold leading-7 tracking-[0.15px] text-[#232729]">
            Replace Existing Sets?
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onCancel}
            className="w-9 h-9 flex items-center justify-center rounded hover:bg-[#F4F5F6] text-[#232729] shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M1 1L15 15M15 1L1 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-8 pb-6 text-[14px] leading-5 tracking-[0.15px] text-[#232729]">
          Importing this file will replace{' '}
          <span className="font-semibold">{duplicateCount} existing {duplicateCount === 1 ? 'search set' : 'search sets'}</span>{' '}
          in your library that {duplicateCount === 1 ? 'has' : 'have'} matching IDs. New IDs will be added as new sets, and all other library sets will remain untouched.
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-8 pt-6 pb-8 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-[5px] rounded text-[14px] font-semibold leading-5 tracking-[0.15px] text-[#232729] hover:bg-[#F4F5F6] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-[5px] rounded text-[14px] font-semibold leading-5 tracking-[0.15px] text-white bg-[#FF5100] hover:bg-[#E64900] transition-colors"
          >
            Import
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type PendingImport = {
  setsToImport: Array<{ guid: string; name: string; conditions: ParsedSearchSet['conditions']; folderPath: string[] }>;
  source: string | undefined;
  duplicateCount: number;
};

function SearchSetsContent() {
  const adapter = useViewerAdapter();
  const toast = useToast();
  const view = useSearchSetsView();
  const [searchSets, setSearchSets] = useState<SearchSet[]>([]);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importMenuAnchor, setImportMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [addMenuAnchor, setAddMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clear the search query when navigating away from the list view.
  useEffect(() => {
    if (view.kind !== 'list') setSearchSetsQuery('');
  }, [view.kind]);

  // Subscribe to the live list so imports / deletes update without refetching.
  useEffect(() => {
    if (adapter.subscribeSearchSets) {
      const unsub = adapter.subscribeSearchSets(setSearchSets);
      return () => unsub();
    }
    setSearchSets(adapter.getSearchSets?.() ?? []);
  }, [adapter]);

  // Listen for the orange Add button in the panel header
  useEffect(() => {
    const handler = () => {
      const btn = document.querySelector('[data-add="search-sets"]');
      if (btn) {
        const rect = btn.getBoundingClientRect();
        setAddMenuAnchor({ x: rect.left, y: rect.bottom + 6 });
      }
    };
    window.addEventListener('mv:search-sets-create', handler);
    return () => window.removeEventListener('mv:search-sets-create', handler);
  }, []);

  const handleRun = (id: string, options?: { additive?: boolean }): number =>
    adapter.executeSearchSet?.(id, options) ?? 0;
  const handleDelete = (id: string) => {
    adapter.deleteSearchSet?.(id);
  };
  const handleRename = (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    adapter.saveSearchSet?.({ id, name: trimmed });
  };
  // Rename a folder by rewriting the matching segment of every descendant set's
  // source / folderPath. The folder id encodes its path as `source::seg1::seg2`.
  const handleMoveSet = (setId: string, source: string | undefined, folderPath: string[]) => {
    const set = searchSets.find((s) => s.id === setId);
    if (!set) return;
    adapter.saveSearchSet?.({ id: setId, name: set.name, source, folderPath });
  };

  // Wrap an entire folder (and everything nested under it) in a new folder by
  // inserting a "New Folder" segment into every descendant set's folderPath at
  // the folder's own position. The folder id is path-encoded as `source::seg…`.
  const handleMoveFolder = (folderId: string) => {
    const parts = folderId.split('::');
    const source = parts[0];
    const pathSegs = parts.slice(1);
    const depth = pathSegs.length;
    const insertAt = Math.max(0, depth - 1); // index within folderPath
    for (const s of searchSets) {
      if ((s.source ?? 'Search Sets') !== source) continue;
      const fp = s.folderPath ?? [];
      if (fp.length < depth) continue;
      if (!pathSegs.every((seg, i) => fp[i] === seg)) continue;
      const newFp = [...fp.slice(0, insertAt), 'New Folder', ...fp.slice(insertAt)];
      adapter.saveSearchSet?.({ id: s.id, name: s.name, source: s.source, folderPath: newFp });
    }
  };

  const handleRenameFolder = (folderId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const parts = folderId.split('::');
    const source = parts[0];
    const pathSegs = parts.slice(1); // segments after the source root
    const depth = pathSegs.length; // 0 → the source grouping itself
    for (const s of searchSets) {
      if ((s.source ?? 'Search Sets') !== source) continue;
      if (depth === 0) {
        adapter.saveSearchSet?.({ id: s.id, name: s.name, source: trimmed, folderPath: s.folderPath });
      } else {
        const fp = s.folderPath ?? [];
        if (fp.length < depth) continue;
        const matches = pathSegs.every((seg, i) => fp[i] === seg);
        if (!matches) continue;
        const newFp = [...fp];
        newFp[depth - 1] = trimmed;
        adapter.saveSearchSet?.({ id: s.id, name: s.name, source: s.source, folderPath: newFp });
      }
    }
  };

  const handleImportClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setImportMenuAnchor({ x: rect.left, y: rect.bottom + 4 });
  };

  // ── File picker → parse → enter import view ─────────────────────────────
  const openFilePicker = useCallback(() => {
    setImportMenuAnchor(null);
    setAddMenuAnchor(null);
    fileInputRef.current?.click();
  }, []);

  const handleFileChosen = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be picked again later
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseSearchSetsXml(text, file.name);
      setSearchSetsView({ kind: 'import', file: parsed });
    } catch (err) {
      const message = err instanceof XmlParseError ? err.message : 'Failed to read XML file.';
      toast.show({ kind: 'error', message });
    }
  }, [toast]);

  // ── Navisworks shortcut → fetch the bundled sample file ─────────────────
  //
  // For the prototype, "Import from Navisworks" skips the picker entirely
  // and loads `public/sample-search-sets.xml` (representative of what a
  // Navisworks Search Sets XML export would look like).
  const importFromNavisworks = useCallback(async () => {
    setImportMenuAnchor(null);
    setAddMenuAnchor(null);
    try {
      const res = await fetch('/sample-search-sets.xml', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = parseSearchSetsXml(text, 'Navisworks Export');
      setSearchSetsView({ kind: 'import', file: parsed });
    } catch (err) {
      const message = err instanceof XmlParseError
        ? err.message
        : 'Failed to load Navisworks sample. Try "Import using .xml" instead.';
      toast.show({ kind: 'error', message });
    }
  }, [toast]);

  // ── Shared import executor (used both directly and after modal confirm) ───
  // Starts the 1.5 s progress animation, then commits on completion.
  const executeImport = useCallback((
    setsToImport: PendingImport['setsToImport'],
    source: string | undefined,
  ) => {
    const save = adapter.saveSearchSet;
    if (!save) {
      toast.show({ kind: 'error', message: 'Import is unavailable: viewer not ready.' });
      return;
    }
    setPendingImport(null);
    setIsImporting(true);
    setTimeout(() => {
      // Build a name→id map of existing sets from the same source so duplicates
      // can be deleted before saving the replacement.
      const existingByName = new Map(
        searchSets.filter((s) => s.source === source).map((s) => [s.name, s.id]),
      );
      for (const s of setsToImport) {
        const duplicateId = existingByName.get(s.name);
        if (duplicateId) adapter.deleteSearchSet?.(duplicateId);
        save({ name: s.name, source, folderPath: s.folderPath, conditions: s.conditions });
      }
      toast.show({
        kind: 'success',
        message: setsToImport.length === 1
          ? `Imported "${setsToImport[0].name}".`
          : `Imported ${setsToImport.length} search sets.`,
      });
      setIsImporting(false);
      resetSearchSetsView();
    }, 1500);
  }, [adapter, searchSets, toast]);

  // ── Import view rendering ───────────────────────────────────────────────
  if (view.kind === 'import') {
    return (
      <>
        <ImportSearchSetsView
          file={view.file}
          isImporting={isImporting}
          onCancel={() => { setPendingImport(null); resetSearchSetsView(); }}
          onImport={(setsToImport) => {
            const source = view.file.fileName;
            // Count how many selected sets would overwrite an existing set by name.
            const existingNames = new Set(
              searchSets.filter((s) => s.source === source).map((s) => s.name),
            );
            const duplicateCount = setsToImport.filter((s) => existingNames.has(s.name)).length;
            if (duplicateCount > 0) {
              setPendingImport({ setsToImport, source, duplicateCount });
            } else {
              executeImport(setsToImport, source);
            }
          }}
        />
        {pendingImport && (
          <DuplicateImportModal
            duplicateCount={pendingImport.duplicateCount}
            onCancel={() => setPendingImport(null)}
            onConfirm={() => executeImport(pendingImport.setsToImport, pendingImport.source)}
          />
        )}
      </>
    );
  }

  if (searchSets.length === 0) {
    return (
      <div className="flex flex-col items-center w-full h-full pt-12 gap-4 bg-[#F4F5F6]">
        {/* Illustration */}
        <img
          src={searchSetsEmptyIllustration}
          alt=""
          width={96}
          height={96}
          className="shrink-0"
        />

        {/* Text */}
        <div className="flex flex-col items-center gap-4 w-full text-center tracking-[0.15px]">
          <p className="font-semibold text-[16px] leading-[24px] text-[#232729] w-full">
            Import Search Sets to Get Started
          </p>
          <p className="font-normal text-[14px] leading-[20px] text-[#5E696E] w-full">
            Import search sets to easily group, track, and manage model elements.
          </p>
        </div>

        {/* Import button — secondary dropdown (#E3E6E8), matches Figma padding exactly */}
        <div className="flex items-center justify-center w-full">
          <button
            type="button"
            onClick={handleImportClick}
            className="flex items-center justify-center rounded bg-[#E3E6E8] hover:bg-[#D0D3D5] transition-colors overflow-clip p-1.5"
          >
            <span className="flex items-start px-1.5 py-0.5">
              <span className="font-semibold text-sm leading-5 tracking-[0.15px] text-[#232729] whitespace-nowrap">
                Import
              </span>
            </span>
            {/* 24×24 caret container, caret SVG already centered inside */}
            <span className="relative shrink-0 size-6">
              <img src={caretDownIcon} alt="" className="absolute inset-0 size-full" />
            </span>
          </button>
        </div>

        {importMenuAnchor && (
          <DropdownMenu position={importMenuAnchor} align="left" onClose={() => setImportMenuAnchor(null)}>
            <DropdownMenuItem onClick={openFilePicker}>
              Import using .xml
            </DropdownMenuItem>
            <DropdownMenuItem onClick={importFromNavisworks}>
              Import from Navisworks
            </DropdownMenuItem>
          </DropdownMenu>
        )}

        {addMenuAnchor && (
          <DropdownMenu position={addMenuAnchor} align="left" onClose={() => setAddMenuAnchor(null)}>
            <DropdownMenuItem onClick={() => setAddMenuAnchor(null)}>Create Folder</DropdownMenuItem>
            <DropdownMenuItem onClick={openFilePicker}>
              Import using .xml
            </DropdownMenuItem>
            <DropdownMenuItem onClick={importFromNavisworks}>
              Import from Navisworks
            </DropdownMenuItem>
          </DropdownMenu>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,application/xml,text/xml"
          className="hidden"
          onChange={handleFileChosen}
        />
      </div>
    );
  }

  return (
    <SearchSetsListView
      searchSets={searchSets}
      onRun={handleRun}
      onDelete={handleDelete}
      onRename={handleRename}
      onRenameFolder={handleRenameFolder}
      onMoveSet={handleMoveSet}
      onMoveFolder={handleMoveFolder}
      loadFolders={() => adapter.getSearchSetFolders?.() ?? []}
      onSaveFolder={(folder) => adapter.saveSearchSetFolder?.(folder)}
      onDeleteFolder={(id) => adapter.deleteSearchSetFolder?.(id)}
      loadOrder={() => adapter.getSearchSetOrder?.() ?? {}}
      onSaveOrder={(orderMap) => adapter.saveSearchSetOrder?.(orderMap)}
      addMenuAnchor={addMenuAnchor}
      setAddMenuAnchor={setAddMenuAnchor}
      openFilePicker={openFilePicker}
      importFromNavisworks={importFromNavisworks}
      fileInputRef={fileInputRef}
      onFileChosen={handleFileChosen}
    />
  );
}

// ─── Search Sets — populated list view ───────────────────────────────────────
//
// ── Drag-and-drop ─────────────────────────────────────────────────────────────
//
// Uses TreeNode's built-in native HTML5 drag-and-drop (draggable + onDragOver/
// onDrop). TreeNode computes before/after/inside from the pointer position
// within the row and renders a blue drop indicator on the row itself, so the
// whole row is a single, easy-to-hit target. See renderListNodes below for the
// wiring and `performMove` for the persistence/membership updates.

/** Sentinel key for items at the top level of the tree (no parent folder). */
const ROOT_KEY = '__root__';

/** Where, relative to a target row, a dragged item will land. */
type DropPosition = 'before' | 'after' | 'inside';

/** Sort `nodes` at one level of the tree according to the persisted order map. */
function applyOrder(
  nodes: ListNode[],
  parentKey: string,
  orderMap: Record<string, string[]>,
): ListNode[] {
  const order = orderMap[parentKey];
  if (!order || order.length === 0) return nodes;
  return [...nodes].sort((a, b) => {
    const aId = a.kind === 'leaf' ? a.set.id : a.id;
    const bId = b.kind === 'leaf' ? b.set.id : b.id;
    const aIdx = order.indexOf(aId);
    const bIdx = order.indexOf(bId);
    if (aIdx === -1 && bIdx === -1) return 0;
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });
}

// ── List-view tree helpers ───────────────────────────────────────────────────

type ListLeaf = { kind: 'leaf'; set: SearchSet };
type ListFolder = { kind: 'folder'; id: string; name: string; children: ListNode[] };
type ListNode = ListLeaf | ListFolder;

// Prefix for ids of empty folders the user created manually (not derived from sets).
const EXTRA_FOLDER_PREFIX = '__newfolder__';

/** Recursively collect all SearchSet ids reachable from a list of nodes. */
function collectListLeafIds(nodes: ListNode[]): string[] {
  return nodes.flatMap((n) => (n.kind === 'leaf' ? [n.set.id] : collectListLeafIds(n.children)));
}

/** Build a folder node whose children are derived from the sets' remaining folderPath. */
function buildListFolder(id: string, name: string, sets: SearchSet[]): ListFolder {
  const noFolder: SearchSet[] = [];
  const subMap = new Map<string, SearchSet[]>();
  for (const s of sets) {
    if (!s.folderPath || s.folderPath.length === 0) {
      noFolder.push(s);
    } else {
      const [head, ...tail] = s.folderPath;
      if (!subMap.has(head)) subMap.set(head, []);
      // Pass a modified copy so the recursion sees only the remaining path.
      subMap.get(head)!.push({ ...s, folderPath: tail });
    }
  }
  const children: ListNode[] = [
    ...Array.from(subMap.entries()).map(([fname, fsets]) =>
      buildListFolder(`${id}::${fname}`, fname, fsets),
    ),
    ...noFolder.map((s): ListLeaf => ({ kind: 'leaf', set: s })),
  ];
  return { kind: 'folder', id, name, children };
}

/** Group sets by source file, then recursively nest by folderPath.
 *  For every source whose direct children contain at least one subfolder the
 *  source label is just a filename wrapper — surface its children directly
 *  (same logic as the import-preview `visibleNodes` stripping).
 *  Sources with only flat leaf sets keep their source folder as a grouping. */
function buildListTree(sets: SearchSet[]): ListNode[] {
  const bySource = new Map<string, SearchSet[]>();
  for (const s of sets) {
    const key = s.source ?? 'Search Sets';
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key)!.push(s);
  }
  const result: ListNode[] = [];
  for (const [src, srcSets] of bySource.entries()) {
    const folder = buildListFolder(src, src, srcSets);
    if (folder.children.some((n) => n.kind === 'folder')) {
      // Source is a meaningless filename wrapper — lift its children up.
      result.push(...folder.children);
    } else {
      // Flat list of sets — keep the source folder so the grouping is visible.
      result.push(folder);
    }
  }
  return result;
}

/** Prune tree to only branches containing a matching leaf (for search). */
function pruneListTree(nodes: ListNode[], q: string): ListNode[] {
  const result: ListNode[] = [];
  for (const n of nodes) {
    if (n.kind === 'leaf') {
      if (n.set.name.toLowerCase().includes(q)) result.push(n);
    } else {
      const prunedChildren = pruneListTree(n.children, q);
      if (prunedChildren.length > 0) result.push({ ...n, children: prunedChildren });
    }
  }
  return result;
}

// ── Move-to-Existing-Folder modal helpers ────────────────────────────────────

/** Locate a folder node by id anywhere in the tree (depth-first). */
function findFolderNode(nodes: ListNode[], id: string): ListFolder | null {
  for (const node of nodes) {
    if (node.kind !== 'folder') continue;
    if (node.id === id) return node;
    const found = findFolderNode(node.children, id);
    if (found) return found;
  }
  return null;
}

type FolderPickerItem = {
  id: string;
  name: string;
  depth: number;
  hasChildren: boolean;
  disabled: boolean;
};

/**
 * Flatten the combined folder tree (derived + extra) into a renderable list,
 * respecting the current `expanded` set. Items whose id equals `excludeId`
 * or starts with `excludeId + '::'` are marked disabled (can't move a folder
 * into itself or one of its descendants).
 */
function buildFolderPickerList(
  fullTree: ListNode[],
  extraFolders: { id: string; name: string; parentId?: string }[],
  expanded: Set<string>,
  excludeId?: string,
): FolderPickerItem[] {
  const result: FolderPickerItem[] = [];

  const isExcluded = (id: string) =>
    !!excludeId && (id === excludeId || id.startsWith(`${excludeId}::`));

  const visit = (nodes: ListNode[], depth: number) => {
    for (const node of nodes) {
      if (node.kind !== 'folder') continue;
      const childDerived = node.children.filter((n): n is ListFolder => n.kind === 'folder');
      const childExtra = extraFolders
        .filter((f) => f.parentId === node.id)
        .map((f): ListFolder => ({ kind: 'folder', id: f.id, name: f.name, children: [] }));
      const allChildren: ListNode[] = [...childDerived, ...childExtra];
      const hasChildren = allChildren.length > 0;
      const disabled = isExcluded(node.id);
      result.push({ id: node.id, name: node.name, depth, hasChildren, disabled });
      if (hasChildren && expanded.has(node.id)) {
        visit(allChildren, depth + 1);
      }
    }
  };

  const rootExtra = extraFolders
    .filter((f) => !f.parentId)
    .map((f): ListFolder => ({ kind: 'folder', id: f.id, name: f.name, children: [] }));

  visit([...fullTree, ...rootExtra], 0);
  return result;
}

/** Modal that lets the user pick an existing folder as a move destination.
 *  Matches the Figma design (node 759-278928): header with folder icon,
 *  scrollable folder tree with expand/collapse, Cancel + Move footer. */
function MoveToFolderModal({
  fullTree,
  extraFolders,
  excludeId,
  onClose,
  onConfirm,
}: {
  fullTree: ListNode[];
  extraFolders: { id: string; name: string; parentId?: string }[];
  excludeId?: string;
  onClose: () => void;
  onConfirm: (destId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    new Set(fullTree.filter((n): n is ListFolder => n.kind === 'folder').map((n) => n.id)),
  );
  const [selected, setSelected] = useState<string | null>(null);

  const items = buildFolderPickerList(fullTree, extraFolders, expanded, excludeId);

  const toggle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center z-[10000]"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-[16px] shadow-[0_4px_28px_rgba(0,0,0,0.28)] w-[560px] max-h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-8 py-6 border-b border-[#D6DADC] shrink-0">
          <img src={folderIconSrc} alt="" width={32} height={32} className="shrink-0" />
          <span className="flex-1 text-[20px] font-semibold leading-[28px] tracking-[0.15px] text-[#232729]">
            Move to Existing Folder
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-black/5 transition-colors"
            aria-label="Close"
          >
            <X size={20} className="text-[#232729]" />
          </button>
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto min-h-0 py-1">
          {items.length === 0 ? (
            <p className="px-8 py-6 text-sm text-[#6A767C] text-center">No folders available.</p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                role="option"
                aria-selected={selected === item.id}
                onClick={() => !item.disabled && setSelected((prev) => (prev === item.id ? null : item.id))}
                className={[
                  'flex items-center gap-2 py-2 pr-3 rounded-lg select-none transition-colors',
                  item.disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer',
                  selected === item.id ? 'bg-[#EDF2FC]' : 'hover:bg-[#F4F5F6]',
                ].join(' ')}
                style={{ paddingLeft: 16 + item.depth * 24 }}
              >
                {/* Expand / collapse chevron */}
                <button
                  type="button"
                  aria-label={expanded.has(item.id) ? 'Collapse' : 'Expand'}
                  className={[
                    'shrink-0 size-6 flex items-center justify-center rounded hover:bg-black/5',
                    item.hasChildren ? '' : 'invisible',
                  ].join(' ')}
                  onClick={(e) => toggle(item.id, e)}
                >
                  {expanded.has(item.id)
                    ? <ChevronDown size={16} className="text-[#232729]" />
                    : <ChevronRight size={16} className="text-[#232729]" />}
                </button>

                {/* Folder icon */}
                <img src={folderIconSrc} alt="" width={24} height={24} className="shrink-0" />

                {/* Label */}
                <span className="flex-1 text-[14px] leading-5 tracking-[0.15px] text-[#232729] truncate min-w-0">
                  {item.name}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-8 pb-8 pt-6 border-t border-[#D6DADC] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-9 rounded text-sm font-semibold text-[#232729] hover:bg-black/5 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onConfirm(selected)}
            className="px-4 h-9 rounded text-sm font-semibold text-white bg-[#FF5100] hover:bg-[#E64900] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Move
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Groups imported sets by their source file (folder) and renders a tree using
// the same TreeNode primitive as the Object Tree and Viewpoints panels.

function SearchSetsListView({
  searchSets,
  onRun,
  onDelete,
  onRename,
  onRenameFolder,
  onMoveSet,
  onMoveFolder,
  loadFolders,
  onSaveFolder,
  onDeleteFolder,
  loadOrder,
  onSaveOrder,
  addMenuAnchor,
  setAddMenuAnchor,
  openFilePicker,
  importFromNavisworks,
  fileInputRef,
  onFileChosen,
}: {
  searchSets: SearchSet[];
  onRun: (id: string, options?: { additive?: boolean }) => number;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onMoveSet: (setId: string, source: string | undefined, folderPath: string[]) => void;
  onMoveFolder: (folderId: string) => void;
  loadFolders: () => { id: string; name: string }[];
  onSaveFolder: (folder: { id: string; name: string }) => void;
  onDeleteFolder: (id: string) => void;
  loadOrder: () => Record<string, string[]>;
  onSaveOrder: (orderMap: Record<string, string[]>) => void;
  addMenuAnchor: { x: number; y: number } | null;
  setAddMenuAnchor: (v: { x: number; y: number } | null) => void;
  openFilePicker: () => void;
  importFromNavisworks: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileChosen: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const query = useSearchSetsQuery();

  // Build the full nested tree from source + folderPath, then optionally prune for search.
  const fullTree = useMemo(() => buildListTree(searchSets), [searchSets]);
  const visibleTree = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? pruneListTree(fullTree, q) : fullTree;
  }, [fullTree, query]);

  // Expand all source-level folders by default; track deeper folders by their path-based id.
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(fullTree.map((f) => f.id)),
  );

  // Auto-expand every folder while a query is active.
  useEffect(() => {
    if (!query.trim()) return;
    function collectIds(nodes: ListNode[]): string[] {
      return nodes.flatMap((n) => (n.kind === 'folder' ? [n.id, ...collectIds(n.children)] : []));
    }
    setExpandedFolders(new Set(collectIds(visibleTree)));
  }, [query, visibleTree]);

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Empty folders the user created manually (folders are otherwise derived from
  // sets, so an empty one has nowhere to live until a set is moved into it).
  // Seeded from persistence so they survive panel close/reopen.
  const [extraFolders, setExtraFolders] = useState<{ id: string; name: string; parentId?: string }[]>(() => loadFolders());

  // ── Drag-and-drop state ────────────────────────────────────────────────────
  // draggingId — the row currently being dragged (null when idle).
  // dropTarget — the row under the pointer + where the drop will land.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition } | null>(null);
  const [orderMap, setOrderMap] = useState<Record<string, string[]>>(() => loadOrder());

  /** Returns the parentKey that owns `id` in the current tree. */
  const getItemParentKey = useCallback((id: string): string => {
    if (id.startsWith(EXTRA_FOLDER_PREFIX)) {
      const f = extraFolders.find((ef) => ef.id === id);
      return f?.parentId ?? ROOT_KEY;
    }
    const set = searchSets.find((s) => s.id === id);
    if (set) {
      const src = set.source ?? 'Search Sets';
      const fp = set.folderPath ?? [];
      return fp.length === 0 ? src : `${src}::${fp.join('::')}`;
    }
    // Derived folder — parent is everything before the last segment.
    const parts = id.split('::');
    return parts.length === 1 ? ROOT_KEY : parts.slice(0, -1).join('::');
  }, [extraFolders, searchSets]);

  /** Build the ordered list of sibling ids within a parent, falling back to
   *  the natural tree order when no explicit order has been persisted. */
  const getSiblingIds = useCallback((parentKey: string): string[] => {
    if (orderMap[parentKey]) return [...orderMap[parentKey]];
    // Fall back to natural order from the current tree.
    const flatSiblings: string[] = [];
    const collectAtParent = (nodes: ListNode[], pk: string) => {
      if (pk !== parentKey) return;
      nodes.forEach((n) => {
        if (n.kind === 'leaf') flatSiblings.push(n.set.id);
        else flatSiblings.push(n.id);
      });
    };
    const walk = (nodes: ListNode[], pk: string) => {
      collectAtParent(nodes, pk);
      nodes.forEach((n) => {
        if (n.kind === 'folder') {
          const childExFolders = extraFolders
            .filter((f) => f.parentId === n.id)
            .map((f): ListNode => ({ kind: 'folder', id: f.id, name: f.name, children: [] }));
          walk([...n.children, ...childExFolders], n.id);
        }
      });
    };
    const rootNodes: ListNode[] = [
      ...fullTree,
      ...extraFolders
        .filter((f) => !f.parentId)
        .map((f): ListNode => ({ kind: 'folder', id: f.id, name: f.name, children: [] })),
    ];
    walk(rootNodes, ROOT_KEY);
    return flatSiblings;
  }, [orderMap, fullTree, extraFolders]);

  /** Resolve a (target row, drop position) into the destination parent key and
   *  the index at which the dragged item should be inserted among its siblings. */
  const resolveDrop = useCallback((targetId: string, position: DropPosition): { newParentKey: string; insertIndex: number } => {
    if (position === 'inside') {
      return { newParentKey: targetId, insertIndex: getSiblingIds(targetId).length };
    }
    const newParentKey = getItemParentKey(targetId);
    const siblings = getSiblingIds(newParentKey);
    const targetIdx = siblings.indexOf(targetId);
    const insertIndex = position === 'before' ? Math.max(0, targetIdx) : targetIdx + 1;
    return { newParentKey, insertIndex };
  }, [getItemParentKey, getSiblingIds]);

  /** Is moving `draggedId` into `newParentKey` allowed? Guards against dropping
   *  a folder into itself/its descendants, sets into manually-created folders,
   *  and cross-parent moves of derived folders (those may only be reordered). */
  const validateMove = useCallback((draggedId: string, newParentKey: string): boolean => {
    if (!draggedId) return false;
    // No dropping a derived folder into itself or its own descendants.
    if (newParentKey === draggedId || newParentKey.startsWith(`${draggedId}::`)) return false;
    // No dropping an extra folder into itself or any descendant extra folder.
    if (newParentKey.startsWith(EXTRA_FOLDER_PREFIX)) {
      let ancestor: string | undefined = newParentKey;
      while (ancestor?.startsWith(EXTRA_FOLDER_PREFIX)) {
        if (ancestor === draggedId) return false;
        ancestor = extraFolders.find((f) => f.id === ancestor)?.parentId;
      }
    }
    const isLeaf = searchSets.some((s) => s.id === draggedId);
    // Sets live in derived-folder hierarchies, not in manually-created folders.
    if (isLeaf && newParentKey.startsWith(EXTRA_FOLDER_PREFIX)) return false;
    // Derived folders may only be reordered within their own parent.
    const isDerivedFolder = !draggedId.startsWith(EXTRA_FOLDER_PREFIX) && !isLeaf;
    if (isDerivedFolder && newParentKey !== getItemParentKey(draggedId)) return false;
    return true;
  }, [extraFolders, searchSets, getItemParentKey]);

  /** Would dropping `draggedId` relative to `targetId` at `position` be valid?
   *  Used to decide whether to show the drop indicator while hovering. */
  const isValidDrop = useCallback((draggedId: string, targetId: string, position: DropPosition): boolean => {
    if (!draggedId || draggedId === targetId) return false;
    const { newParentKey } = resolveDrop(targetId, position);
    return validateMove(draggedId, newParentKey);
  }, [resolveDrop, validateMove]);

  /** Commit a drop: update the persisted order map and, when the parent changed,
   *  the dragged item's membership (set folderPath/source or extra-folder parentId). */
  const performMove = useCallback((draggedId: string, targetId: string, position: DropPosition) => {
    const { newParentKey, insertIndex } = resolveDrop(targetId, position);
    if (!validateMove(draggedId, newParentKey)) return;

    const isLeaf = searchSets.some((s) => s.id === draggedId);
    const currentParentKey = getItemParentKey(draggedId);

    // ── Update order map ───────────────────────────────────────────
    const newOrderMap = { ...orderMap };

    // Remove from current parent's order list.
    const currentOrder = [...getSiblingIds(currentParentKey)];
    const removeIdx = currentOrder.indexOf(draggedId);
    if (removeIdx !== -1) currentOrder.splice(removeIdx, 1);
    newOrderMap[currentParentKey] = currentOrder;

    // Removal shifts indices when reordering within the same parent.
    const adjustedIndex =
      currentParentKey === newParentKey && removeIdx !== -1 && removeIdx < insertIndex
        ? insertIndex - 1
        : insertIndex;

    if (currentParentKey === newParentKey) {
      const fresh = [...(newOrderMap[newParentKey] ?? [])];
      fresh.splice(adjustedIndex, 0, draggedId);
      newOrderMap[newParentKey] = fresh;
    } else {
      const newOrder = [...getSiblingIds(newParentKey)];
      newOrder.splice(adjustedIndex, 0, draggedId);
      newOrderMap[newParentKey] = newOrder;
    }

    setOrderMap(newOrderMap);
    onSaveOrder(newOrderMap);

    // ── Update membership if parent changed ────────────────────────
    if (currentParentKey !== newParentKey) {
      if (draggedId.startsWith(EXTRA_FOLDER_PREFIX)) {
        const newParentId = newParentKey === ROOT_KEY ? undefined : newParentKey;
        setExtraFolders((prev) =>
          prev.map((f) => (f.id === draggedId ? { ...f, parentId: newParentId } : f)),
        );
        const folder = extraFolders.find((f) => f.id === draggedId);
        if (folder) {
          const updated = { ...folder, name: folder.name };
          if (newParentId) updated.parentId = newParentId;
          else delete (updated as { parentId?: string }).parentId;
          onSaveFolder(updated);
        }
      } else if (isLeaf) {
        const parts = newParentKey.split('::');
        const newSource = newParentKey === ROOT_KEY ? undefined : parts[0];
        const newFolderPath = newParentKey === ROOT_KEY ? [] : parts.slice(1);
        onMoveSet(draggedId, newSource, newFolderPath);
      }
    }

    // Auto-expand the destination folder so the moved item is visible.
    if (position === 'inside') {
      setExpandedFolders((prev) => new Set([...prev, targetId]));
    }
  }, [
    orderMap, extraFolders, searchSets, resolveDrop, validateMove,
    getItemParentKey, getSiblingIds, onSaveOrder, onSaveFolder, onMoveSet,
  ]);

  // ── Per-row native-DnD handlers (passed to TreeNode) ────────────────────────
  // draggingIdRef mirrors draggingId so the dragover/drop handlers always read
  // the latest dragged id without stale closures or nested-setState hacks.
  const draggingIdRef = useRef<string | null>(null);
  const dropTargetRef = useRef<{ id: string; position: DropPosition } | null>(null);

  const handleNodeDragStart = useCallback((id: string) => {
    draggingIdRef.current = id;
    setDraggingId(id);
  }, []);

  const handleNodeDragEnd = useCallback(() => {
    draggingIdRef.current = null;
    dropTargetRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
  }, []);

  const handleNodeDragOver = useCallback((id: string, position: DropPosition) => {
    const dragging = draggingIdRef.current;
    const next = dragging && isValidDrop(dragging, id, position) ? { id, position } : null;
    dropTargetRef.current = next;
    setDropTarget((prev) => {
      if (prev?.id === next?.id && prev?.position === next?.position) return prev;
      return next;
    });
  }, [isValidDrop]);

  const handleNodeDragLeave = useCallback((id: string) => {
    if (dropTargetRef.current?.id === id) {
      dropTargetRef.current = null;
      setDropTarget((prev) => (prev?.id === id ? null : prev));
    }
  }, []);

  const handleNodeDrop = useCallback((id: string) => {
    const dragging = draggingIdRef.current;
    const target = dropTargetRef.current;
    if (dragging && target && target.id === id) {
      performMove(dragging, id, target.position);
    }
    draggingIdRef.current = null;
    dropTargetRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
  }, [performMove]);

  // Every selectable unit: search-set ids plus empty-folder ids.
  const allSelectableIds = [...searchSets.map((s) => s.id), ...extraFolders.map((f) => f.id)];
  const totalItems = allSelectableIds.length;
  const checkedCount = checkedIds.size;
  const masterState: 'unchecked' | 'checked' | 'indeterminate' =
    totalItems > 0 && checkedCount === totalItems
      ? 'checked'
      : checkedCount > 0
        ? 'indeterminate'
        : 'unchecked';

  const toggleAll = () => {
    if (checkedCount > 0) setCheckedIds(new Set());
    else setCheckedIds(new Set(allSelectableIds));
  };

  const toggleItem = (id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const toast = useToast();

  const handleRunSelected = () => {
    const checked = [...checkedIds];
    // Empty folders have no sets to run — exclude them.
    const ids = checked.filter((id) => !id.startsWith(EXTRA_FOLDER_PREFIX));
    if (ids.length === 0) {
      // If only empty folders are selected, be specific about why nothing runs.
      const onlyEmptyFolders = checked.some((id) => id.startsWith(EXTRA_FOLDER_PREFIX));
      toast.show({
        kind: 'error',
        message: onlyEmptyFolders
          ? 'This folder has no search sets to run.'
          : 'Select one or more search sets to run a search.',
      });
      return;
    }
    // First set replaces the current selection; the rest accumulate so running
    // several sets at once highlights the union of all their elements.
    const total = ids.reduce((sum, id, i) => sum + onRun(id, { additive: i > 0 }), 0);
    if (total > 0) {
      toast.show({
        kind: 'success',
        message: `${total} object${total === 1 ? '' : 's'} found.`,
      });
    } else {
      toast.show({
        kind: 'error',
        message: 'No elements in this model match the selected search set(s).',
      });
    }
  };

  const [bulkMenuAnchor, setBulkMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [actionMenuAnchor, setActionMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [moveFolderAnchor, setMoveFolderAnchor] = useState<{ x: number; y: number } | null>(null);
  const moveFolderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);
  const [deleteTargetName, setDeleteTargetName] = useState<string | null>(null);
  const [deleteTargetIsFolder, setDeleteTargetIsFolder] = useState(false);
  const [deleteTargetFolderId, setDeleteTargetFolderId] = useState<string | null>(null);
  const [moveToFolderModal, setMoveToFolderModal] = useState<{
    mode: 'single';
    id: string;
    isFolder: boolean;
  } | { mode: 'bulk' } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowOverflowAnchor, setRowOverflowAnchor] = useState<
    { id: string; ids: string[]; name: string; isFolder: boolean; x: number; y: number; anchorTop: number } | null
  >(null);
  const [rowMoveFolderAnchor, setRowMoveFolderAnchor] = useState<{ x: number; y: number } | null>(null);
  const rowMoveFolderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Captures the move target (set or folder) when the Move-to-folder submenu
  // opens so clicking "New Folder" still works even after DropdownMenu's
  // outside-click handler has cleared rowOverflowAnchor.
  const pendingMoveTargetRef = useRef<{ id: string; isFolder: boolean } | null>(null);

  const handleRunSingle = (id: string) => {
    const total = onRun(id, { additive: false });
    if (total > 0) {
      toast.show({ kind: 'success', message: `${total} object${total === 1 ? '' : 's'} found.` });
    } else {
      toast.show({ kind: 'error', message: 'No elements in this model match this search set.' });
    }
  };

  // Run one or more sets at once (used by row + folder double-click). The first
  // set replaces the current selection; the rest accumulate so the highlight is
  // the union of every set's elements.
  const runSets = (ids: string[]) => {
    if (ids.length === 0) {
      // Empty folder — nothing to run. Guide the user toward a fix.
      toast.show({ kind: 'error', message: 'This folder has no search sets to run.' });
      return;
    }
    const total = ids.reduce((sum, id, i) => sum + onRun(id, { additive: i > 0 }), 0);
    if (total > 0) {
      toast.show({ kind: 'success', message: `${total} object${total === 1 ? '' : 's'} found.` });
    } else {
      toast.show({ kind: 'error', message: 'No elements in this model match the selected search set(s).' });
    }
  };

  const handleDeleteSelected = () => {
    setActionMenuAnchor(null);
    setDeleteTargetIds([...checkedIds]);
    setDeleteTargetName(null);
    setDeleteTargetIsFolder(false);
    setDeleteTargetFolderId(null);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    const ids = deleteTargetIds;
    // Partition into real search sets vs manually-created empty folders.
    const setIds = ids.filter((id) => !id.startsWith(EXTRA_FOLDER_PREFIX));
    const extraIds = new Set(ids.filter((id) => id.startsWith(EXTRA_FOLDER_PREFIX)));
    if (deleteTargetFolderId?.startsWith(EXTRA_FOLDER_PREFIX)) extraIds.add(deleteTargetFolderId);

    setIds.forEach((id) => onDelete(id));
    if (extraIds.size > 0) {
      setExtraFolders((prev) => prev.filter((f) => !extraIds.has(f.id)));
      extraIds.forEach((id) => onDeleteFolder(id));
    }
    setCheckedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      extraIds.forEach((id) => next.delete(id));
      return next;
    });

    setShowDeleteConfirm(false);
    setDeleteTargetIds([]);
    setDeleteTargetName(null);
    setDeleteTargetIsFolder(false);
    setDeleteTargetFolderId(null);

    const groups = setIds.length;
    const folders = extraIds.size;
    let message: string;
    if (groups > 0 && folders === 0) {
      message = groups === 1 ? '1 search group deleted.' : `${groups} search groups deleted.`;
    } else if (folders > 0 && groups === 0) {
      message = folders === 1 ? 'Folder deleted.' : `${folders} folders deleted.`;
    } else {
      message = `${groups + folders} items deleted.`;
    }
    toast.show({ kind: 'success', message });
  };

  const handleCreateFolder = () => {
    setAddMenuAnchor(null);
    const id = `${EXTRA_FOLDER_PREFIX}${crypto.randomUUID()}`;
    setExtraFolders((prev) => [...prev, { id, name: 'New Folder' }]);
    onSaveFolder({ id, name: 'New Folder' });
    // Drop straight into rename mode and scroll the new row into view.
    setRenamingId(id);
    setRenameValue('New Folder');
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  // Action menu → Move to folder → New Folder creates a destination folder and
  // moves the currently selected items under it.
  const handleActionMoveToNewFolder = () => {
    setMoveFolderAnchor(null);
    setActionMenuAnchor(null);

    const selectedIds = [...checkedIds];
    const selectedSetIds = selectedIds.filter((id) => !id.startsWith(EXTRA_FOLDER_PREFIX));
    const selectedExtraFolderIds = selectedIds.filter((id) => id.startsWith(EXTRA_FOLDER_PREFIX));
    const selectedSetIdSet = new Set(selectedSetIds);

    // Build a full tree (derived folders + nested extra folders) and detect
    // fully-selected derived folders so we can move whole subtrees first.
    const rootNodes: ListNode[] = [
      ...fullTree,
      ...extraFolders
        .filter((f) => !f.parentId)
        .map((f): ListNode => ({ kind: 'folder', id: f.id, name: f.name, children: [] })),
    ];

    const fullySelectedDerivedFolders: string[] = [];
    const coveredLeafIds = new Set<string>();
    const visit = (nodes: ListNode[]) => {
      for (const node of nodes) {
        if (node.kind !== 'folder') continue;
        const childExtraFolders = extraFolders
          .filter((f) => f.parentId === node.id)
          .map((f): ListNode => ({ kind: 'folder', id: f.id, name: f.name, children: [] }));
        const allChildren: ListNode[] = [...node.children, ...childExtraFolders];
        const leafIds = collectListLeafIds(allChildren);
        const isDerivedFolder = !node.id.startsWith(EXTRA_FOLDER_PREFIX);
        const fullySelected = leafIds.length > 0 && leafIds.every((id) => selectedSetIdSet.has(id));
        if (isDerivedFolder && fullySelected) {
          fullySelectedDerivedFolders.push(node.id);
          leafIds.forEach((id) => coveredLeafIds.add(id));
          // Parent folder move already carries descendants; don't recurse.
          continue;
        }
        visit(allChildren);
      }
    };
    visit(rootNodes);

    // Move fully-selected derived folders as folders (preserves subtree shape).
    fullySelectedDerivedFolders.forEach((folderId) => {
      onMoveFolder(folderId);
      const parts = folderId.split('::');
      const pathSegs = parts.slice(1);
      const insertAt = Math.max(0, pathSegs.length - 1);
      const newFolderId = [parts[0], ...pathSegs.slice(0, insertAt), 'New Folder'].join('::');
      setExpandedFolders((prev) => new Set([...prev, parts[0], newFolderId]));
    });

    // Move any remaining selected sets (those not already carried by a moved folder).
    const selectedSets = selectedSetIds
      .filter((id) => !coveredLeafIds.has(id))
      .map((id) => searchSets.find((s) => s.id === id))
      .filter((s): s is SearchSet => !!s);

    const setsBySource = new Map<string, SearchSet[]>();
    selectedSets.forEach((set) => {
      const source = set.source ?? 'Search Sets';
      const arr = setsBySource.get(source) ?? [];
      arr.push(set);
      setsBySource.set(source, arr);
    });

    setsBySource.forEach((sets, source) => {
      sets.forEach((set) => {
        const newFolderPath = [...(set.folderPath ?? []), 'New Folder'];
        onMoveSet(set.id, source, newFolderPath);
        setExpandedFolders((prev) => new Set([...prev, source, `${source}::${newFolderPath.join('::')}`]));
      });
    });

    // Selected empty/manual folders are moved under a newly-created manual folder.
    if (selectedExtraFolderIds.length > 0) {
      const id = `${EXTRA_FOLDER_PREFIX}${crypto.randomUUID()}`;
      const folder = { id, name: 'New Folder' };
      setExtraFolders((prev) =>
        [...prev, folder].map((f) =>
          selectedExtraFolderIds.includes(f.id) ? { ...f, parentId: id } : f,
        ),
      );
      onSaveFolder(folder);
      selectedExtraFolderIds.forEach((folderId) => {
        const existing = extraFolders.find((f) => f.id === folderId);
        if (!existing) return;
        onSaveFolder({ ...existing, parentId: id });
      });
      setRenamingId(id);
      setRenameValue('New Folder');
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
      // If we also moved derived folders/sets, keep this folder expanded but
      // let rename target prefer the derived destination below.
      setExpandedFolders((prev) => new Set([...prev, id]));
      if (selectedSets.length === 0 && fullySelectedDerivedFolders.length === 0) return;
    }

    // Start rename on the first derived destination so users can quickly rename it.
    const firstFolderMove = fullySelectedDerivedFolders[0];
    if (firstFolderMove) {
      const parts = firstFolderMove.split('::');
      const pathSegs = parts.slice(1);
      const insertAt = Math.max(0, pathSegs.length - 1);
      setRenamingId([parts[0], ...pathSegs.slice(0, insertAt), 'New Folder'].join('::'));
      setRenameValue('New Folder');
      return;
    }
    if (selectedSets.length > 0) {
      const firstSet = selectedSets[0];
      setRenamingId([firstSet.source ?? 'Search Sets', ...(firstSet.folderPath ?? []), 'New Folder'].join('::'));
      setRenameValue('New Folder');
    }
  };

  const handleMoveToExistingFolder = (destId: string) => {
    const state = moveToFolderModal;
    setMoveToFolderModal(null);
    if (!state) return;

    const isExtraDest = destId.startsWith(EXTRA_FOLDER_PREFIX);
    const destParts = destId.split('::');
    const destSource = isExtraDest ? undefined : destParts[0];
    const destFolderPath = isExtraDest ? [] : destParts.slice(1);

    const performSetMove = (setId: string) => {
      if (isExtraDest) {
        toast.show({ kind: 'info', message: 'Search sets cannot be moved into manual folders.' });
        return;
      }
      onMoveSet(setId, destSource, destFolderPath);
    };

    const performExtraFolderMove = (folderId: string) => {
      setExtraFolders((prev) =>
        prev.map((f) => (f.id === folderId ? { ...f, parentId: destId } : f)),
      );
      const folder = extraFolders.find((f) => f.id === folderId);
      if (folder) onSaveFolder({ ...folder, parentId: destId });
    };

    if (state.mode === 'single') {
      const { id, isFolder } = state;
      if (id.startsWith(EXTRA_FOLDER_PREFIX)) {
        performExtraFolderMove(id);
      } else if (isFolder) {
        // Derived folder — move all contained sets to the destination.
        if (!isExtraDest) {
          const folderNode = findFolderNode(fullTree, id);
          if (folderNode) {
            const leafIds = collectListLeafIds([folderNode]);
            searchSets
              .filter((s) => leafIds.includes(s.id))
              .forEach((s) => onMoveSet(s.id, destSource, destFolderPath));
          }
        } else {
          toast.show({ kind: 'info', message: 'Derived folders cannot be moved into manual folders.' });
          return;
        }
      } else {
        performSetMove(id);
      }
    } else {
      // Bulk mode.
      const allSelected = [...checkedIds];
      const setIds = allSelected.filter((id) => !id.startsWith(EXTRA_FOLDER_PREFIX) && searchSets.some((s) => s.id === id));
      const extraIds = allSelected.filter((id) => id.startsWith(EXTRA_FOLDER_PREFIX));
      setIds.forEach((id) => performSetMove(id));
      extraIds.forEach((id) => performExtraFolderMove(id));
    }

    // Auto-expand the destination so the moved items are visible.
    setExpandedFolders((prev) => new Set([...prev, destId]));
  };

  const handleCreateNestedFolder = (parentId: string) => {
    setRowOverflowAnchor(null);
    const id = `${EXTRA_FOLDER_PREFIX}${crypto.randomUUID()}`;
    const folder = { id, name: 'New Folder', parentId };
    setExtraFolders((prev) => [...prev, folder]);
    onSaveFolder(folder);
    // Ensure the parent is expanded so the new child is visible.
    setExpandedFolders((prev) => new Set([...prev, parentId]));
    setRenamingId(id);
    setRenameValue('New Folder');
  };

  const commitRename = () => {
    const id = renamingId;
    setRenamingId(null);
    if (!id) return;
    // Manually-created empty folder — update its name in local state + storage.
    if (id.startsWith(EXTRA_FOLDER_PREFIX)) {
      const trimmed = renameValue.trim();
      if (trimmed) {
        setExtraFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: trimmed } : f)));
        const existing = extraFolders.find((f) => f.id === id);
        onSaveFolder({ id, name: trimmed, ...(existing?.parentId ? { parentId: existing.parentId } : {}) });
      }
      // The id is stable across the rename, so the spinner lands on the same row.
      setSavingId(id);
      setTimeout(() => setSavingId((cur) => (cur === id ? null : cur)), 600);
      return;
    }
    // Show a spinner on the row while the save settles. Storage writes are
    // synchronous, so hold the spinner briefly to give visible feedback.
    if (searchSets.some((s) => s.id === id)) {
      // Leaf: the set id is stable across the rename.
      setSavingId(id);
      onRename(id, renameValue);
      setTimeout(() => setSavingId((cur) => (cur === id ? null : cur)), 600);
    } else {
      // Folder: its id is path-encoded, so renaming the last segment changes
      // the id. Point the spinner at the NEW id so it lands on the renamed row.
      const trimmed = renameValue.trim();
      const parts = id.split('::');
      const newId = trimmed ? [...parts.slice(0, -1), trimmed].join('::') : id;
      onRenameFolder(id, renameValue);
      setSavingId(newId);
      setTimeout(() => setSavingId((cur) => (cur === newId ? null : cur)), 600);
      // Keep the renamed folder expanded (its id changed, so update the set).
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        next.delete(id);
        next.add(newId);
        return next;
      });
    }
  };

  const handleMoveToNewFolder = () => {
    const target = pendingMoveTargetRef.current;
    if (!target) return;
    pendingMoveTargetRef.current = null;
    setRowMoveFolderAnchor(null);
    setRowOverflowAnchor(null);

    let newFolderId: string;
    if (target.isFolder) {
      // Wrap the whole folder (and its contents) in a new sibling folder.
      onMoveFolder(target.id);
      const parts = target.id.split('::');
      const pathSegs = parts.slice(1);
      const insertAt = Math.max(0, pathSegs.length - 1);
      newFolderId = [parts[0], ...pathSegs.slice(0, insertAt), 'New Folder'].join('::');
    } else {
      const set = searchSets.find((s) => s.id === target.id);
      if (!set) return;
      const newFolderPath = [...(set.folderPath ?? []), 'New Folder'];
      onMoveSet(target.id, set.source, newFolderPath);
      newFolderId = [set.source ?? 'Search Sets', ...newFolderPath].join('::');
    }

    // The tree re-derives the folder from the updated set data; drop straight
    // into rename mode on it and keep it expanded so its contents stay visible.
    setRenamingId(newFolderId);
    setRenameValue('New Folder');
    setExpandedFolders((prev) => new Set([...prev, newFolderId]));
  };

  // Drop indicator for the row currently under the pointer. TreeNode renders a
  // blue line for 'before'/'after' (via dropIndicator) and a blue row highlight
  // for 'inside' (via isDropTarget).
  const indicatorFor = (id: string): 'before' | 'after' | undefined =>
    dropTarget?.id === id && dropTarget.position !== 'inside' ? dropTarget.position : undefined;
  const isInsideTarget = (id: string): boolean =>
    dropTarget?.id === id && dropTarget.position === 'inside';

  // Recursively render the nested list tree.
  function renderListNodes(nodes: ListNode[], depth: number, parentKey: string): React.ReactNode {
    const orderedNodes = applyOrder(nodes, parentKey, orderMap);

    return orderedNodes.map((n) => {
      if (n.kind === 'leaf') {
        const set = n.set;
        return (
          <TreeNode
            key={set.id}
            id={set.id}
            label={set.name}
            depth={depth}
            type="leaf"
            checked={checkedIds.has(set.id)}
            onCheckedChange={(id, checked) => { toggleItem(id, checked); }}
            selected={checkedIds.has(set.id)}
            onClick={(id) => { toggleItem(id, !checkedIds.has(id)); }}
            onDoubleClick={(id) => {
              toggleItem(id, true);
              handleRunSingle(id);
            }}
            isRenaming={renamingId === set.id}
            renameValue={renameValue}
            onRenameChange={setRenameValue}
            onRenameCommit={commitRename}
            onRenameCancel={() => setRenamingId(null)}
            spinner={savingId === set.id}
            hoverBg="#F4F5F6"
            showActionsOnHover
            hideActionsOnSelect
            draggable={renamingId !== set.id}
            onDragStart={handleNodeDragStart}
            onDragEnd={handleNodeDragEnd}
            onDragOver={handleNodeDragOver}
            onDragLeave={handleNodeDragLeave}
            onDrop={handleNodeDrop}
            dropIndicator={indicatorFor(set.id)}
            isDragging={draggingId === set.id}
            actions={
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Run search"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Keep row-action search single-focus, not additive.
                    setCheckedIds(new Set([set.id]));
                    handleRunSingle(set.id);
                  }}
                  className="w-6 h-6 flex items-center justify-center rounded-[4px] bg-[#E3E6E8] hover:bg-[#D6DADC] text-[#3D454B] transition-colors"
                >
                  <div className="relative shrink-0 size-4">
                    <div className="absolute inset-[10.41%_9.55%_9.55%_10.41%]">
                      <img src={searchFieldFigmaIcon} alt="" className="absolute block inset-0 max-w-none size-full" />
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  aria-label="More actions"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setRowOverflowAnchor({ id: set.id, ids: [set.id], name: set.name, isFolder: false, x: rect.right, y: rect.bottom + 4, anchorTop: rect.top });
                  }}
                  className="w-6 h-6 flex items-center justify-center rounded-[4px] bg-[#E3E6E8] hover:bg-[#D6DADC] text-[#3D454B] transition-colors"
                >
                  <MoreVertical size={16} strokeWidth={2} />
                </button>
              </div>
            }
          />
        );
      }

      // Folder node
      const childExtraFolders = extraFolders
        .filter((f) => f.parentId === n.id)
        .map((f): ListNode => ({ kind: 'folder', id: f.id, name: f.name, children: [] }));
      const allChildren: ListNode[] = [...n.children, ...childExtraFolders];
      const leafIds = collectListLeafIds(allChildren);
      const selectionIds = leafIds.length === 0 ? [n.id] : leafIds;
      const folderAllChecked = selectionIds.length > 0 && selectionIds.every((id) => checkedIds.has(id));
      const folderSomeChecked = selectionIds.some((id) => checkedIds.has(id));
      const handleFolderCheck = (_id: string, checked: boolean) => {
        setCheckedIds((prev) => {
          const next = new Set(prev);
          selectionIds.forEach((id) => (checked ? next.add(id) : next.delete(id)));
          return next;
        });
      };
      return (
        <TreeNode
          key={n.id}
          id={n.id}
          label={n.name}
          depth={depth}
          type="folder"
          hideChevron={allChildren.length === 0}
          expanded={expandedFolders.has(n.id)}
          onToggle={(id) => {
            setExpandedFolders((prev) => {
              const next = new Set(prev);
              next.has(id) ? next.delete(id) : next.add(id);
              return next;
            });
          }}
          checked={folderAllChecked}
          indeterminate={folderSomeChecked && !folderAllChecked}
          selected={folderAllChecked}
          onCheckedChange={handleFolderCheck}
          onClick={() => {
            const nowChecked = !folderAllChecked;
            setCheckedIds((prev) => {
              const next = new Set(prev);
              selectionIds.forEach((id) => (nowChecked ? next.add(id) : next.delete(id)));
              return next;
            });
          }}
          onDoubleClick={() => {
            setCheckedIds((prev) => {
              const next = new Set(prev);
              leafIds.forEach((id) => next.add(id));
              return next;
            });
            runSets(leafIds);
          }}
          isRenaming={renamingId === n.id}
          renameValue={renameValue}
          onRenameChange={setRenameValue}
          onRenameCommit={commitRename}
          onRenameCancel={() => setRenamingId(null)}
          spinner={savingId === n.id}
          hoverBg="#F4F5F6"
          showActionsOnHover
          hideActionsOnSelect
          draggable={renamingId !== n.id}
          onDragStart={handleNodeDragStart}
          onDragEnd={handleNodeDragEnd}
          onDragOver={handleNodeDragOver}
          onDragLeave={handleNodeDragLeave}
          onDrop={handleNodeDrop}
          dropIndicator={indicatorFor(n.id)}
          isDropTarget={isInsideTarget(n.id)}
          isDragging={draggingId === n.id}
          actions={
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Run search"
                onClick={(e) => {
                  e.stopPropagation();
                  // Running from a folder row should focus selection on this
                  // folder's result set (not accumulate prior folder selection).
                  setCheckedIds(new Set(leafIds));
                  runSets(leafIds);
                }}
                className="w-6 h-6 flex items-center justify-center rounded-[4px] bg-[#E3E6E8] hover:bg-[#D6DADC] text-[#3D454B] transition-colors"
              >
                <div className="relative shrink-0 size-4">
                  <div className="absolute inset-[10.41%_9.55%_9.55%_10.41%]">
                    <img src={searchFieldFigmaIcon} alt="" className="absolute block inset-0 max-w-none size-full" />
                  </div>
                </div>
              </button>
              <button
                type="button"
                aria-label="More actions"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setRowOverflowAnchor({ id: n.id, ids: leafIds, name: n.name, isFolder: true, x: rect.right, y: rect.bottom + 4, anchorTop: rect.top });
                }}
                className="w-6 h-6 flex items-center justify-center rounded-[4px] bg-[#E3E6E8] hover:bg-[#D6DADC] text-[#3D454B] transition-colors"
              >
                <MoreVertical size={16} strokeWidth={2} />
              </button>
            </div>
          }
        >
          {renderListNodes(allChildren, depth + 1, n.id)}
        </TreeNode>
      );
    });
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Bulk-actions row */}
      <div
        className="flex items-center justify-between px-4 h-10 shrink-0 transition-colors"
        style={{
          background: checkedCount > 0 ? '#EDF2FC' : '#FFFFFF',
        }}
      >
        <div className="flex items-center gap-2">
          {/* Master checkbox */}
          <button
            type="button"
            role="checkbox"
            aria-checked={masterState === 'indeterminate' ? 'mixed' : masterState === 'checked'}
            aria-label="Select all"
            onClick={toggleAll}
            className={`shrink-0 size-5 rounded-[2px] flex items-center justify-center transition-colors cursor-pointer ${
              masterState === 'unchecked' ? 'bg-white border-2 border-[#6A767C]' : 'bg-[#2066DF]'
            }`}
          >
            {masterState === 'checked' && <Check size={14} strokeWidth={3} className="text-white" />}
            {masterState === 'indeterminate' && <span className="block w-[10px] h-[2px] bg-white" />}
          </button>

          {/* Chevron — decorative, no action */}
          <span className="w-6 h-6 flex items-center justify-center rounded shrink-0">
            <ChevronDown className="text-[#6A767C]" />
          </span>

          {/* Action dropdown — only visible when items are checked */}
          {checkedCount > 0 && (
            <button
              type="button"
              aria-label="Actions"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setActionMenuAnchor({ x: rect.left, y: rect.bottom + 4 });
              }}
              className="flex items-center gap-1 px-2 h-6 rounded text-[12px] font-semibold leading-4 tracking-[0.25px] text-[#232729] hover:bg-black/5 shrink-0"
            >
              Action
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 3.5L5 6.5L8 3.5" stroke="#232729" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>

        <span className="text-[12px] leading-4 tracking-[0.25px] text-[#232729]">
          {checkedCount > 0
            ? `${checkedCount} of ${totalItems} Selected`
            : `${totalItems} ${totalItems === 1 ? 'Item' : 'Items'}`}
        </span>
      </div>

      {/* Select / deselect dropdown */}
      {bulkMenuAnchor && (
        <DropdownMenu position={bulkMenuAnchor} align="left" onClose={() => setBulkMenuAnchor(null)}>
          <DropdownMenuItem onClick={() => { setCheckedIds(new Set(allSelectableIds)); setBulkMenuAnchor(null); }}>
            Select all
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { setCheckedIds(new Set()); setBulkMenuAnchor(null); }}>
            Deselect all
          </DropdownMenuItem>
        </DropdownMenu>
      )}

      {/* Per-row overflow dropdown */}
      {rowOverflowAnchor && (
        <DropdownMenu
          position={{ x: rowOverflowAnchor.x, y: rowOverflowAnchor.y, anchorTop: rowOverflowAnchor.anchorTop }}
          onClose={() => { setRowOverflowAnchor(null); setRowMoveFolderAnchor(null); }}
        >
          <DropdownMenuItem onClick={() => { setRenamingId(rowOverflowAnchor.id); setRenameValue(rowOverflowAnchor.name); setRowOverflowAnchor(null); }}>
            Rename
          </DropdownMenuItem>
          {rowOverflowAnchor.isFolder && (
            <DropdownMenuItem onClick={() => handleCreateNestedFolder(rowOverflowAnchor.id)}>
              Create new folder
            </DropdownMenuItem>
          )}
          {/* Move to folder — hover opens submenu */}
          <DropdownMenuItem
            onMouseEnter={(e) => {
              if (rowMoveFolderTimerRef.current) clearTimeout(rowMoveFolderTimerRef.current);
              // Snapshot the target now — rowOverflowAnchor may be cleared by the
              // time the user clicks inside the portalled submenu.
              pendingMoveTargetRef.current = rowOverflowAnchor
                ? { id: rowOverflowAnchor.id, isFolder: rowOverflowAnchor.isFolder }
                : null;
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setRowMoveFolderAnchor({ x: rect.right, y: rect.top });
            }}
            onMouseLeave={() => {
              rowMoveFolderTimerRef.current = setTimeout(() => setRowMoveFolderAnchor(null), 150);
            }}
            onClick={() => {/* stub */}}
          >
            <span className="flex items-center justify-between w-full gap-4">
              Move to folder
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M6 4l4 4-4 4" stroke="#232729" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { setDeleteTargetIds(rowOverflowAnchor.ids); setDeleteTargetName(rowOverflowAnchor.name); setDeleteTargetIsFolder(rowOverflowAnchor.isFolder); setDeleteTargetFolderId(rowOverflowAnchor.isFolder ? rowOverflowAnchor.id : null); setShowDeleteConfirm(true); setRowOverflowAnchor(null); }}>
            Delete
          </DropdownMenuItem>
        </DropdownMenu>
      )}

      {/* Per-row Move to folder submenu. Rendered as its own portal for correct
          fixed positioning (the parent menu has a transform). It is tagged
          data-dropdown-keep-open so DropdownMenu's outside-click handler does not
          close the parent on mousedown — otherwise the button unmounts before its
          click can fire. */}
      {rowOverflowAnchor && rowMoveFolderAnchor && createPortal(
        <div
          data-dropdown-keep-open
          className="fixed bg-white rounded shadow-[0_4px_12px_0_rgba(0,0,0,0.2)] py-1 z-[9999] w-[168px]"
          style={{ left: rowMoveFolderAnchor.x, top: rowMoveFolderAnchor.y }}
          onMouseEnter={() => {
            if (rowMoveFolderTimerRef.current) clearTimeout(rowMoveFolderTimerRef.current);
          }}
          onMouseLeave={() => {
            rowMoveFolderTimerRef.current = setTimeout(() => setRowMoveFolderAnchor(null), 150);
          }}
        >
          <button
            type="button"
            onClick={handleMoveToNewFolder}
            className="w-full flex items-center px-4 h-[28px] text-[14px] text-left text-[#232729] hover:bg-[#F4F5F6]"
          >
            New Folder
          </button>
          <button
            type="button"
            onClick={() => {
              const target = pendingMoveTargetRef.current;
              pendingMoveTargetRef.current = null;
              setRowMoveFolderAnchor(null);
              setRowOverflowAnchor(null);
              if (!target) return;
              setMoveToFolderModal({ mode: 'single', id: target.id, isFolder: target.isFolder });
            }}
            className="w-full flex items-center px-4 h-[28px] text-[14px] text-left text-[#232729] hover:bg-[#F4F5F6]"
          >
            Existing Folder
          </button>
        </div>,
        document.body,
      )}

      {/* Action dropdown */}
      {actionMenuAnchor && (
        <DropdownMenu position={actionMenuAnchor} align="left" onClose={() => { setActionMenuAnchor(null); setMoveFolderAnchor(null); }}>
          {/* Move to folder — hover opens submenu */}
          <DropdownMenuItem
            onMouseEnter={(e) => {
              if (moveFolderTimerRef.current) clearTimeout(moveFolderTimerRef.current);
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setMoveFolderAnchor({ x: rect.right, y: rect.top });
            }}
            onMouseLeave={() => {
              moveFolderTimerRef.current = setTimeout(() => setMoveFolderAnchor(null), 150);
            }}
            onClick={() => {/* stub */}}
          >
            <span className="flex items-center justify-between w-full gap-4">
              Move to folder
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M6 4l4 4-4 4" stroke="#232729" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDeleteSelected}>
            Delete
          </DropdownMenuItem>
        </DropdownMenu>
      )}

      {/* Move to folder submenu */}
      {moveFolderAnchor && createPortal(
        <div
          data-dropdown-keep-open
          className="fixed bg-white rounded shadow-[0_4px_12px_0_rgba(0,0,0,0.2)] py-1 z-[9999] w-[168px]"
          style={{ left: moveFolderAnchor.x, top: moveFolderAnchor.y }}
          onMouseEnter={() => {
            if (moveFolderTimerRef.current) clearTimeout(moveFolderTimerRef.current);
          }}
          onMouseLeave={() => {
            moveFolderTimerRef.current = setTimeout(() => setMoveFolderAnchor(null), 150);
          }}
        >
          <button
            type="button"
            onClick={handleActionMoveToNewFolder}
            className="w-full flex items-center px-4 h-[28px] text-[14px] text-left text-[#232729] hover:bg-[#F4F5F6]"
          >
            New Folder
          </button>
          <button
            type="button"
            onClick={() => {
              setMoveFolderAnchor(null);
              setActionMenuAnchor(null);
              setMoveToFolderModal({ mode: 'bulk' });
            }}
            className="w-full flex items-center px-4 h-[28px] text-[14px] text-left text-[#232729] hover:bg-[#F4F5F6]"
          >
            Existing Folder
          </button>
        </div>,
        document.body,
      )}

      {/* Tree */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {visibleTree.length === 0 && extraFolders.length === 0 && query.trim() && (
          <p className="px-4 py-6 text-sm text-[#6A767C] text-center">No search sets match "{query}".</p>
        )}
        {renderListNodes(
          query.trim()
            ? visibleTree
            : [
                ...visibleTree,
                ...extraFolders
                  .filter((f) => !f.parentId)
                  .map((f): ListNode => ({ kind: 'folder', id: f.id, name: f.name, children: [] })),
              ],
          0,
          ROOT_KEY,
        )}
      </div>

      {/* Footer — Run selected (always visible, always enabled) */}
      <div className="flex items-center justify-end px-4 py-2 bg-white shrink-0">
        <button
          type="button"
          onClick={handleRunSelected}
          className="px-3 h-7 rounded text-sm font-semibold text-white bg-[#FF5100] hover:bg-[#E64900] transition-colors"
        >
          Search
        </button>
      </div>

      {addMenuAnchor && (
        <DropdownMenu position={addMenuAnchor} align="left" onClose={() => setAddMenuAnchor(null)}>
          <DropdownMenuItem onClick={handleCreateFolder}>Create Folder</DropdownMenuItem>
          <DropdownMenuItem onClick={openFilePicker}>Import using .xml</DropdownMenuItem>
          <DropdownMenuItem onClick={importFromNavisworks}>Import from Navisworks</DropdownMenuItem>
        </DropdownMenu>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".xml,application/xml,text/xml"
        className="hidden"
        onChange={onFileChosen}
      />

      {showDeleteConfirm && (
        <DeleteConfirmModal
          count={deleteTargetIds.length}
          name={deleteTargetName ?? (deleteTargetIds.length === 1 ? searchSets.find((s) => s.id === deleteTargetIds[0])?.name : undefined)}
          isFolder={deleteTargetIsFolder}
          onCancel={() => { setShowDeleteConfirm(false); setDeleteTargetIds([]); setDeleteTargetName(null); setDeleteTargetIsFolder(false); setDeleteTargetFolderId(null); }}
          onConfirm={confirmDelete}
        />
      )}

      {moveToFolderModal && (
        <MoveToFolderModal
          fullTree={fullTree}
          extraFolders={extraFolders}
          excludeId={moveToFolderModal.mode === 'single' ? moveToFolderModal.id : undefined}
          onClose={() => setMoveToFolderModal(null)}
          onConfirm={handleMoveToExistingFolder}
        />
      )}
    </div>
  );
}

// ─── Related Items ────────────────────────────────────────────────────────────

const ITEMS = [
  { key: 'assets',                label: 'Assets',                icon: itemsAssetIcon        },
  { key: 'coordination-issues',   label: 'Coordination Issues',   icon: itemsCoordIssueIcon   },
  { key: 'punch-list',            label: 'Punch List',            icon: itemsPunchListIcon    },
  { key: 'quality-inspections',   label: 'Quality Inspections',   icon: itemsInspectionIcon   },
  { key: 'quality-observation',   label: 'Quality Observation',   icon: itemsObservationIcon  },
  { key: 'rfis',                  label: 'RFIs',                  icon: itemsRfiIcon          },
  { key: 'safety-inspections',    label: 'Safety Inspections',    icon: itemsInspectionIcon   },
  { key: 'safety-observation',    label: 'Safety Observation',    icon: itemsObservationIcon  },
  { key: 'submittals',            label: 'Submittals',            icon: itemsSubmittalIcon    },
] as const;

function ItemsContent() {
  const view = useItemsView();
  const adapter = useViewerAdapter();

  const handleAssetClick = (asset: Asset) => {
    // Bridge to the BIM model. linkedElementId is an IFC expressID today;
    // when the adapter gains GUID lookup, only the values change.
    adapter.selectAndFocusObject?.(asset.linkedElementId);
    setItemsView({ kind: 'asset-detail', assetId: asset.id, assetName: asset.name });
  };

  return (
    <div className="bg-white rounded-md overflow-hidden">
      {view.kind === 'hub' && (
        <ul className="px-2 py-1">
          {ITEMS.map(({ key, label, icon }) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => {
                  if (key === 'assets') {
                    setItemsView({ kind: 'assets-list' });
                  } else {
                    setItemsView({ kind: 'category-placeholder', category: key, label });
                  }
                }}
                className="flex w-full items-center justify-between rounded-md px-2 py-[11px] text-left transition-colors hover:bg-gray-100"
              >
                <span className="flex items-center gap-3 text-sm font-semibold text-gray-700">
                  <img src={icon} alt="" width={16} height={16} className="flex-shrink-0" />
                  {label}
                </span>
                <img src={itemsArrowIcon} alt="" width={24} height={24} className="flex-shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {view.kind === 'assets-list' && (
        <AssetsListView onAssetClick={handleAssetClick} />
      )}

      {view.kind === 'asset-detail' && (
        <AssetDetailView assetId={view.assetId} />
      )}

      {view.kind === 'category-placeholder' && (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-gray-700">
            {view.label} content goes here.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Awaiting direction on what to show in this section.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Object Tree ──────────────────────────────────────────────────────────────

interface ObjNode {
  id: string;
  label: string;
  type: 'folder' | 'file';
  objectId?: string;
  expressID?: string;
  parentId?: string;
  children?: ObjNode[];
}

const DEMO_OBJECT_TREE: ObjNode[] = [
  {
    id: 'demo-structural', label: 'Structural', type: 'folder', children: [
      { id: 'o-foundation-slab', label: 'Foundation Slab', type: 'file', objectId: 'demo-1', expressID: 'demo-1', parentId: 'demo-structural' },
      { id: 'o-grade-beam', label: 'Grade Beam', type: 'file', objectId: 'demo-2', expressID: 'demo-2', parentId: 'demo-structural' },
      { id: 'o-concrete-column', label: 'Concrete Column', type: 'file', objectId: 'demo-3', expressID: 'demo-3', parentId: 'demo-structural' },
      { id: 'o-steel-beam', label: 'Steel Beam', type: 'file', objectId: 'demo-4', expressID: 'demo-4', parentId: 'demo-structural' },
      { id: 'o-shear-wall', label: 'Shear Wall', type: 'file', objectId: 'demo-5', expressID: 'demo-5', parentId: 'demo-structural' },
      { id: 'o-pile-cap', label: 'Pile Cap', type: 'file', objectId: 'demo-6', expressID: 'demo-6', parentId: 'demo-structural' },
    ],
  },
  {
    id: 'demo-architecture', label: 'Architecture', type: 'folder', children: [
      { id: 'o-exterior-wall', label: 'Exterior Wall', type: 'file', objectId: 'demo-7', expressID: 'demo-7', parentId: 'demo-architecture' },
      { id: 'o-interior-partition', label: 'Interior Partition', type: 'file', objectId: 'demo-8', expressID: 'demo-8', parentId: 'demo-architecture' },
      { id: 'o-curtain-wall', label: 'Curtain Wall', type: 'file', objectId: 'demo-9', expressID: 'demo-9', parentId: 'demo-architecture' },
      { id: 'o-door', label: 'Door', type: 'file', objectId: 'demo-10', expressID: 'demo-10', parentId: 'demo-architecture' },
      { id: 'o-window', label: 'Window', type: 'file', objectId: 'demo-11', expressID: 'demo-11', parentId: 'demo-architecture' },
      { id: 'o-floor-slab', label: 'Floor Slab', type: 'file', objectId: 'demo-12', expressID: 'demo-12', parentId: 'demo-architecture' },
      { id: 'o-roof-panel', label: 'Roof Panel', type: 'file', objectId: 'demo-13', expressID: 'demo-13', parentId: 'demo-architecture' },
      { id: 'o-staircase', label: 'Staircase', type: 'file', objectId: 'demo-14', expressID: 'demo-14', parentId: 'demo-architecture' },
      { id: 'o-railing', label: 'Railing', type: 'file', objectId: 'demo-15', expressID: 'demo-15', parentId: 'demo-architecture' },
    ],
  },
  {
    id: 'demo-mep', label: 'MEP', type: 'folder', children: [
      { id: 'o-ahu', label: 'Air Handler Unit', type: 'file', objectId: 'demo-16', expressID: 'demo-16', parentId: 'demo-mep' },
      { id: 'o-supply-duct', label: 'Supply Duct', type: 'file', objectId: 'demo-17', expressID: 'demo-17', parentId: 'demo-mep' },
      { id: 'o-return-duct', label: 'Return Duct', type: 'file', objectId: 'demo-18', expressID: 'demo-18', parentId: 'demo-mep' },
      { id: 'o-vav-box', label: 'VAV Box', type: 'file', objectId: 'demo-19', expressID: 'demo-19', parentId: 'demo-mep' },
      { id: 'o-chw-pump', label: 'Chilled Water Pump', type: 'file', objectId: 'demo-20', expressID: 'demo-20', parentId: 'demo-mep' },
      { id: 'o-sprinkler', label: 'Sprinkler Head', type: 'file', objectId: 'demo-21', expressID: 'demo-21', parentId: 'demo-mep' },
      { id: 'o-elec-panel', label: 'Electrical Panel', type: 'file', objectId: 'demo-22', expressID: 'demo-22', parentId: 'demo-mep' },
      { id: 'o-conduit', label: 'Conduit Run', type: 'file', objectId: 'demo-23', expressID: 'demo-23', parentId: 'demo-mep' },
    ],
  },
  {
    id: 'demo-site', label: 'Site', type: 'folder', children: [
      { id: 'o-paving', label: 'Paving', type: 'file', objectId: 'demo-24', expressID: 'demo-24', parentId: 'demo-site' },
      { id: 'o-retaining-wall', label: 'Retaining Wall', type: 'file', objectId: 'demo-25', expressID: 'demo-25', parentId: 'demo-site' },
      { id: 'o-curb', label: 'Curb & Gutter', type: 'file', objectId: 'demo-26', expressID: 'demo-26', parentId: 'demo-site' },
    ],
  },
];

export const OBJECT_TREE_BREADCRUMBS = ['Tool Name', 'Child Page Title', 'Active C...'];

function flattenObjNodes(nodes: ObjNode[]): ObjNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenObjNodes(node.children) : [])]);
}

function collectObjNodeIds(node: ObjNode): string[] {
  return [node.id, ...(node.children ? node.children.flatMap(collectObjNodeIds) : [])];
}

function collectLeafIds(node: ObjNode): string[] {
  if (!node.children || node.children.length === 0) return [node.id];
  return node.children.flatMap(collectLeafIds);
}


const IFC_TYPE_DISPLAY: Record<string, string> = {
  IFCBEAM: 'Beams',
  IFCBUILDING: 'Building',
  IFCBUILDINGSTOREY: 'Storeys',
  IFCCOLUMN: 'Columns',
  IFCCOVERING: 'Coverings',
  IFCCURTAINWALL: 'Curtain Walls',
  IFCDOOR: 'Doors',
  IFCFLOWELEMENT: 'Flow Elements',
  IFCFLOWCONTROLLER: 'Flow Controllers',
  IFCFLOWMOVINGDEVICE: 'Fans & Pumps',
  IFCFLOWSEGMENT: 'Ducts & Pipes',
  IFCFLOWTERMINAL: 'HVAC Terminals',
  IFCFOOTING: 'Footings',
  IFCFURNISHINGELEMENT: 'Furniture',
  IFCMEMBER: 'Structural Members',
  IFCOPENINGELEMENT: 'Openings',
  IFCPILE: 'Piles',
  IFCPLATE: 'Plates',
  IFCRAILING: 'Railings',
  IFCRAMP: 'Ramps',
  IFCROOF: 'Roofs',
  IFCSITE: 'Site',
  IFCSLAB: 'Slabs',
  IFCSPACE: 'Spaces',
  IFCSTAIR: 'Stairs',
  IFCWALL: 'Walls',
  IFCWALLSTANDARDCASE: 'Walls',
  IFCWINDOW: 'Windows',
};

function formatIfcTypeLabel(rawType: string): string {
  return IFC_TYPE_DISPLAY[rawType.toUpperCase()] ?? rawType;
}

function buildObjectTreeByType(nodes: Array<{ id: string; label: string; ifcType: string; expressID: string }>): ObjNode[] {
  const byType = new Map<string, { displayLabel: string; children: ObjNode[] }>();
  nodes.forEach((node) => {
    const rawType = node.ifcType || 'Uncategorized';
    const displayLabel = formatIfcTypeLabel(rawType);
    const folderId = `ifc-${displayLabel}`;
    const child: ObjNode = {
      id: node.id,
      label: node.label || node.expressID,
      type: 'file',
      objectId: node.expressID || node.id,
      expressID: node.expressID,
      parentId: folderId,
    };
    if (!byType.has(displayLabel)) byType.set(displayLabel, { displayLabel, children: [] });
    byType.get(displayLabel)!.children.push(child);
  });

  return Array.from(byType.values())
    .sort((a, b) => a.displayLabel.localeCompare(b.displayLabel))
    .map(({ displayLabel, children }) => ({
      id: `ifc-${displayLabel}`,
      label: displayLabel,
      type: 'folder',
      children: children.sort((a, b) => a.label.localeCompare(b.label)),
    }));
}

function ObjectTreeToolbar() {
  const [query, setQuery] = useState('');
  return (
    <div className="px-4 py-2 border-b border-[#d6dadc]">
      <PanelSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Filter by Keyword"
        onFilter={() => {}}
      />
    </div>
  );
}

interface ObjTreeNodeProps {
  node: ObjNode;
  depth?: number;
  checkedIds: Set<string>;
  expandedIds: Set<string>;
  loadingIds?: Set<string>;
  hiddenIds: Set<string>;
  onToggleChecked: (node: ObjNode, checked: boolean) => void;
  onToggleExpanded: (nodeId: string) => void;
  onHide: (expressID: string) => void;
  onShow: (expressID: string) => void;
}

function ObjTreeNode({
  node,
  depth = 0,
  checkedIds,
  expandedIds,
  loadingIds,
  hiddenIds,
  onToggleChecked,
  onToggleExpanded,
  onHide,
  onShow,
}: ObjTreeNodeProps) {
  const expanded = node.children ? expandedIds.has(node.id) : false;
  const isLoading = loadingIds ? loadingIds.has(node.id) : false;
  const isFolder = node.type === 'folder';

  const leafIds = isFolder ? collectLeafIds(node) : null;
  const checkedLeafCount = leafIds ? leafIds.filter((id) => checkedIds.has(id)).length : 0;
  // A folder with its own ID in checkedIds was explicitly checked via its checkbox —
  // treat it as fully checked even if streaming later adds new children not yet in checkedIds.
  const folderExplicitlyChecked = isFolder && checkedIds.has(node.id);
  const checked = isFolder
    ? folderExplicitlyChecked || (leafIds!.length > 0 && checkedLeafCount === leafIds!.length)
    : checkedIds.has(node.id);
  const indeterminate = isFolder
    ? !folderExplicitlyChecked && checkedLeafCount > 0 && checkedLeafCount < leafIds!.length
    : false;

  const isHidden = node.expressID ? hiddenIds.has(node.expressID) : false;

  return (
    <TreeNode
      id={node.id}
      label={node.label}
      depth={depth}
      type={isFolder ? 'folder' : 'leaf'}
      expanded={expanded}
      onToggle={onToggleExpanded}
      checked={checked}
      indeterminate={indeterminate}
      onCheckedChange={(_id, c) => onToggleChecked(node, c)}
      loading={isLoading}
      showActionsOnHover={!isHidden}
      actions={node.expressID ? (
        <button
          type="button"
          aria-label={isHidden ? 'Show object' : 'Hide object'}
          onClick={(e) => {
            e.stopPropagation();
            if (isHidden) onShow(node.expressID!);
            else onHide(node.expressID!);
          }}
          className="flex items-center justify-center rounded p-0.5 hover:bg-[#E3E6E8] transition-colors"
        >
          <img src={isHidden ? showIcon : hideIcon} alt="" width={16} height={16} />
        </button>
      ) : undefined}
    >
      {node.children?.map((child) => (
        <ObjTreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          checkedIds={checkedIds}
          expandedIds={expandedIds}
          loadingIds={loadingIds}
          hiddenIds={hiddenIds}
          onToggleChecked={onToggleChecked}
          onToggleExpanded={onToggleExpanded}
          onHide={onHide}
          onShow={onShow}
        />
      ))}
    </TreeNode>
  );
}

function ObjectTreeContent() {
  const adapter = useViewerAdapter();
  const [objectEntries, setObjectEntries] = useState(() => adapter.getObjectList?.() ?? []);
  const prevEntryCountRef = useRef(objectEntries.length);
  useEffect(() => {
    const unsubscribe = adapter.subscribeObjectList?.((entries) => {
      if (entries.length !== prevEntryCountRef.current) {
        prevEntryCountRef.current = entries.length;
        setObjectEntries(entries);
      }
    });
    if (!unsubscribe) {
      setObjectEntries(adapter.getObjectList?.() ?? []);
    }
    return () => unsubscribe?.();
  }, [adapter]);

  const realObjectNodes = useMemo<ObjNode[]>(() => {
    const entries = objectEntries;
    const normalized = entries.map((entry) => ({
      id: entry.id,
      label: entry.name || entry.expressID,
      ifcType: entry.ifcType || '',
      expressID: entry.expressID,
    }));
    return buildObjectTreeByType(normalized);
  }, [objectEntries]);
  const objectTreeNodes = realObjectNodes.length > 0 ? realObjectNodes : DEMO_OBJECT_TREE;
  const flatNodes = useMemo(() => flattenObjNodes(objectTreeNodes), [objectTreeNodes]);
  const nodeIdByExpressId = useMemo(() => {
    const map = new Map<string, string>();
    flatNodes.forEach((node) => {
      if (node.expressID) map.set(node.expressID, node.id);
      if (node.objectId) map.set(node.objectId, node.id);
      map.set(node.id, node.id);
    });
    return map;
  }, [flatNodes]);
  const parentIdByNodeId = useMemo(() => {
    const map = new Map<string, string>();
    flatNodes.forEach((node) => {
      if (node.parentId) map.set(node.id, node.parentId);
    });
    return map;
  }, [flatNodes]);

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const unsubscribe = adapter.subscribeHiddenObjects?.((ids) => setHiddenIds(new Set(ids)));
    return () => unsubscribe?.();
  }, [adapter]);

  const handleHide = useCallback((expressID: string) => {
    adapter.hideObjects?.([expressID]);
  }, [adapter]);

  const handleShow = useCallback((expressID: string) => {
    adapter.showObjects?.([expressID]);
  }, [adapter]);

  const [streamComplete, setStreamComplete] = useState(() => adapter.getObjectStreamingState?.()?.streamComplete ?? true);
  useEffect(() => {
    const unsubscribe = adapter.subscribeObjectStreamingState?.((state) => {
      setStreamComplete(state.streamComplete);
    });
    return () => unsubscribe?.();
  }, [adapter]);

  const loadingIds = useMemo<Set<string> | undefined>(() => {
    if (streamComplete) return undefined;
    const ids = new Set<string>();
    flatNodes.forEach((node) => ids.add(node.id));
    return ids;
  }, [streamComplete, flatNodes]);

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const syncingFromModelSelectionRef = useRef(false);
  const pendingCheckboxUpdateRef = useRef(false);
  const totalObjects = flatNodes.length;
  const checkedCount = checkedIds.size;
  const hasSelection = checkedCount > 0;
  const masterCheckboxState: 'unchecked' | 'checked' | 'indeterminate' =
    totalObjects > 0 && checkedCount === totalObjects
      ? 'checked'
      : checkedCount > 0
        ? 'indeterminate'
        : 'unchecked';

  // Only clear selections when the model fully unloads (entries drop to 0).
  // Do NOT clear on every streaming batch — that would wipe selections mid-stream.
  useEffect(() => {
    if (objectEntries.length === 0) setCheckedIds(new Set());
  }, [objectEntries]);

  useEffect(() => {
    const unsubscribe = adapter.subscribeSelectedObjects?.((selectedExpressIds) => {
      if (pendingCheckboxUpdateRef.current) {
        pendingCheckboxUpdateRef.current = false;
        return;
      }
      const nextChecked = new Set<string>();
      const parentsToExpand = new Set<string>();

      selectedExpressIds.forEach((expressId) => {
        const nodeId = nodeIdByExpressId.get(String(expressId));
        if (!nodeId) return;
        nextChecked.add(nodeId);
        const parentId = parentIdByNodeId.get(nodeId);
        if (parentId) parentsToExpand.add(parentId);
      });

      syncingFromModelSelectionRef.current = true;
      setCheckedIds(nextChecked);
      if (parentsToExpand.size > 0) {
        setExpandedIds((prev) => {
          const next = new Set(prev);
          parentsToExpand.forEach((id) => next.add(id));
          return next;
        });
      }
      queueMicrotask(() => {
        syncingFromModelSelectionRef.current = false;
      });
    });
    return () => unsubscribe?.();
  }, [adapter, nodeIdByExpressId, parentIdByNodeId]);

  useEffect(() => {
    if (syncingFromModelSelectionRef.current) return;
    const selectedObjectIds = flatNodes
      .filter((node) => checkedIds.has(node.id))
      .map((node) => node.objectId)
      .filter((id): id is string => Boolean(id));
    adapter.setSelectedObjects?.(selectedObjectIds);
  }, [adapter, checkedIds, flatNodes]);

  const onToggleChecked = useCallback((node: ObjNode, checked: boolean) => {
    pendingCheckboxUpdateRef.current = true;
    const affectedIds = collectObjNodeIds(node);
    setCheckedIds((prev) => {
      const next = new Set(prev);
      affectedIds.forEach((id) => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
          // When unchecking, remove parent folder's explicit-check marker so
          // it falls back to derived (indeterminate/unchecked) state.
          const parentId = parentIdByNodeId.get(id);
          if (parentId) next.delete(parentId);
        }
      });
      return next;
    });
  }, [parentIdByNodeId]);

  // Master checkbox click:
  // - any selection (full or partial) → clear selection
  // - no selection → select all
  // This matches the standard tri-state header behavior on lists like GitHub/Gmail.
  const onToggleRootChecked = useCallback(() => {
    pendingCheckboxUpdateRef.current = true;
    if (checkedCount > 0) setCheckedIds(new Set());
    else setCheckedIds(new Set(flatNodes.map((node) => node.id)));
  }, [checkedCount, flatNodes]);

  const onToggleExpanded = useCallback((nodeId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!actionsOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActionsOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [actionsOpen]);

  useEffect(() => {
    if (!actionMenuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setActionMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [actionMenuOpen]);

  // Close the action menu automatically if the selection is cleared.
  useEffect(() => {
    if (!hasSelection && actionMenuOpen) setActionMenuOpen(false);
  }, [hasSelection, actionMenuOpen]);

  const onHideObjects = useCallback(() => {
    const checkedExpressIds = flatNodes
      .filter((node) => checkedIds.has(node.id))
      .map((node) => node.expressID)
      .filter((id): id is string => Boolean(id));

    if (checkedExpressIds.length > 0) {
      adapter.hideObjects?.(checkedExpressIds);
    }
    setActionsOpen(false);
  }, [adapter, checkedIds, flatNodes]);

  return (
    <div className="flex flex-col h-full">
      {/*
        Bulk actions row — non-scrolling header above the internal scroll
        region. Lives outside the scroll container so the panel's scrollbar
        starts below this row instead of overlapping it.
      */}
      <div
        className={`flex items-center justify-between px-4 h-10 shadow-[0_1px_0_#dcdcdc] shrink-0 ${
          hasSelection ? 'bg-[#EDF2FC]' : 'bg-white'
        }`}
      >
        <div className="flex items-center gap-2">
          {/* Master checkbox — supports unchecked / checked / indeterminate */}
          <button
            type="button"
            role="checkbox"
            aria-checked={masterCheckboxState === 'indeterminate' ? 'mixed' : masterCheckboxState === 'checked'}
            aria-label="Select all"
            disabled={!!loadingIds || totalObjects === 0}
            onClick={onToggleRootChecked}
            className={`shrink-0 size-5 rounded-[2px] flex items-center justify-center transition-colors ${
              masterCheckboxState === 'unchecked'
                ? 'bg-white border-2 border-[#6A767C]'
                : 'bg-[#2066DF]'
            } ${loadingIds || totalObjects === 0 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {masterCheckboxState === 'checked' && (
              <Check size={14} strokeWidth={3} className="text-white" />
            )}
            {masterCheckboxState === 'indeterminate' && (
              <span className="block w-[10px] h-[2px] bg-white" />
            )}
          </button>

          {/* Selection-helper menu (anchored to caret) — kept for "Hide objects" parity. */}
          <div className="relative" ref={actionsRef}>
            <button
              type="button"
              onClick={() => setActionsOpen((o) => !o)}
              aria-label="Bulk actions"
              disabled={!!loadingIds}
              className="w-6 h-6 flex items-center justify-center rounded shrink-0 hover:bg-black/5 disabled:opacity-30"
            >
              <ChevronDown size={16} className="text-[#6A767C]" />
            </button>
            {actionsOpen && (
              <div className="absolute left-0 top-full mt-1 min-w-[140px] rounded-md border border-gray-200 bg-white shadow-lg z-50 py-1">
                <button
                  type="button"
                  onClick={onHideObjects}
                  disabled={checkedCount === 0}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  Hide objects
                </button>
              </div>
            )}
          </div>

          {/* Action dropdown — only visible while a selection exists. */}
          {hasSelection && (
            <div className="relative" ref={actionMenuRef}>
              <button
                type="button"
                onClick={() => setActionMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={actionMenuOpen}
                className="flex items-center gap-1 h-6 px-2 rounded text-[12px] leading-[16px] tracking-[0.25px] font-semibold text-[#232729] hover:bg-black/5"
              >
                Action
                <ChevronDown size={14} className="text-[#232729]" />
              </button>
              {actionMenuOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full mt-1 min-w-[160px] rounded-md border border-gray-200 bg-white shadow-lg z-50 py-1"
                >
                  <div className="px-3 py-1.5 text-[12px] leading-[16px] tracking-[0.25px] text-[#6A767C] italic">
                    No actions yet
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <span className="text-[12px] leading-[16px] tracking-[0.25px] text-[#232729]">
          {hasSelection ? `${checkedCount} of ${totalObjects} Selected` : `${totalObjects} Items`}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="py-1 bg-white">
          {objectTreeNodes.map((node) => (
            <ObjTreeNode
              key={node.id}
              node={node}
              depth={0}
              checkedIds={checkedIds}
              expandedIds={expandedIds}
              loadingIds={loadingIds}
              hiddenIds={hiddenIds}
              onToggleChecked={onToggleChecked}
              onToggleExpanded={onToggleExpanded}
              onHide={handleHide}
              onShow={handleShow}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Properties ──────────────────────────────────────────────────────────────

function PropertyRow({
  prop,
  isFavorited,
  onToggleFavorite,
}: {
  prop: ObjectProperty;
  isFavorited: boolean;
  onToggleFavorite: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      className="group border-b border-[#eef0f1] last:border-b-0 h-8"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td className="pl-3 pr-2 py-1 text-xs text-[#232729] truncate max-w-[140px]">
        {prop.name}
      </td>
      <td className="pr-2 py-1 text-xs text-[#6a767c] truncate max-w-[140px]">
        {prop.value}
      </td>
      <td className="w-7 pr-2 py-1 text-center">
        <button
          type="button"
          aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          onClick={onToggleFavorite}
          className={`inline-flex items-center justify-center w-5 h-5 rounded hover:bg-[#eef0f1] transition-colors ${hovered || isFavorited ? 'opacity-100' : 'opacity-0'}`}
          tabIndex={hovered || isFavorited ? 0 : -1}
        >
          <Star
            size={13}
            className={isFavorited ? 'text-[#f5a623] fill-[#f5a623]' : 'text-[#9da7ad]'}
          />
        </button>
      </td>
    </tr>
  );
}

function PropertyGroupCard({
  group,
  favoriteKeys,
  onToggleFavorite,
  searchQuery,
}: {
  group: PropertyGroup;
  favoriteKeys: Set<string>;
  onToggleFavorite: (groupName: string, propName: string) => void;
  searchQuery: string;
}) {
  const [expanded, setExpanded] = useState(true);

  const filteredProps = useMemo(() => {
    if (!searchQuery) return group.properties;
    const q = searchQuery.toLowerCase();
    return group.properties.filter(
      (p) => p.name.toLowerCase().includes(q) || p.value.toLowerCase().includes(q),
    );
  }, [group.properties, searchQuery]);

  if (filteredProps.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-[0_0_4px_rgba(0,0,0,0.12)] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full px-3 py-2.5 text-left hover:bg-[#fafbfb] transition-colors"
      >
        {expanded
          ? <ChevronDown size={14} className="text-[#6a767c] shrink-0" />
          : <ChevronRight size={14} className="text-[#6a767c] shrink-0" />}
        <span className="text-[13px] font-semibold text-[#232729] truncate">{group.name}</span>
        <span className="text-[11px] text-[#9da7ad] ml-auto shrink-0">{filteredProps.length}</span>
      </button>
      {expanded && (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#f4f5f6] border-y border-[#d6dadc]">
              <th className="pl-3 pr-2 py-1.5 text-left text-[11px] font-semibold text-[#6a767c] uppercase tracking-wider">Name</th>
              <th className="pr-2 py-1.5 text-left text-[11px] font-semibold text-[#6a767c] uppercase tracking-wider">Value</th>
              <th className="w-7 pr-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {filteredProps.map((prop) => {
              const favKey = `${group.name}::${prop.name}`;
              return (
                <PropertyRow
                  key={favKey}
                  prop={prop}
                  isFavorited={favoriteKeys.has(favKey)}
                  onToggleFavorite={() => onToggleFavorite(group.name, prop.name)}
                />
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function PropertiesContent({
  propertiesTab = 'all-properties',
  searchQuery = '',
}: {
  propertiesTab?: PropertiesTabId;
  searchQuery?: string;
} = {}) {
  const adapter = useViewerAdapter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groups, setGroups] = useState<PropertyGroup[]>([]);
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = adapter.subscribeSelectedObjects?.((ids) => {
      setSelectedIds(ids.map(String));
    });
    return () => unsub?.();
  }, [adapter]);

  useEffect(() => {
    const expressID = selectedIds[0];
    if (!expressID) {
      setGroups([]);
      return;
    }
    const result = adapter.getObjectProperties?.(expressID) ?? [];
    setGroups(result);
  }, [adapter, selectedIds]);

  const handleToggleFavorite = useCallback((groupName: string, propName: string) => {
    const key = `${groupName}::${propName}`;
    setFavoriteKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const favoritesGroup: PropertyGroup | null = useMemo(() => {
    if (favoriteKeys.size === 0) return null;
    const props: ObjectProperty[] = [];
    for (const g of groups) {
      for (const p of g.properties) {
        if (favoriteKeys.has(`${g.name}::${p.name}`)) {
          props.push(p);
        }
      }
    }
    if (props.length === 0) return null;
    return { name: 'Favorites', properties: props };
  }, [favoriteKeys, groups]);

  if (propertiesTab === 'related-items') {
    return (
      <p className="px-3 py-6 text-sm text-[#9da7ad] text-center">
        No related items available for the selected object.
      </p>
    );
  }

  if (selectedIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] h-full px-6 py-12 gap-3">
        <img src={propertiesEmptyIllustration} width={101} height={100} alt="" aria-hidden="true" />
        <div className="text-center">
          <p className="text-[14px] font-semibold text-[#232729] leading-[20px]">Select an object</p>
          <p className="text-[13px] text-[#6A767C] leading-[18px] mt-1">Select an object to view its properties.</p>
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <p className="px-3 py-6 text-sm text-[#9da7ad] text-center">
        No properties available for this element.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {favoritesGroup && (
        <PropertyGroupCard
          group={favoritesGroup}
          favoriteKeys={favoriteKeys}
          onToggleFavorite={handleToggleFavorite}
          searchQuery={searchQuery}
        />
      )}
      {groups.map((g) => (
        <PropertyGroupCard
          key={g.name}
          group={g}
          favoriteKeys={favoriteKeys}
          onToggleFavorite={handleToggleFavorite}
          searchQuery={searchQuery}
        />
      ))}
    </div>
  );
}

export function PropertiesToolbar({
  propertiesTab = 'all-properties',
  searchQuery = '',
  onSearchChange,
}: {
  propertiesTab?: PropertiesTabId;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
} = {}) {
  const adapter = useViewerAdapter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    const unsub = adapter.subscribeSelectedObjects?.((ids) => {
      setSelectedIds(ids.map(String));
    });
    return () => unsub?.();
  }, [adapter]);

  if (propertiesTab !== 'all-properties' || selectedIds.length === 0) return null;

  return (
    <div className="bg-white border-b border-[#d6dadc] px-4 py-2 shrink-0">
      <PanelSearchBar
        value={searchQuery}
        onChange={onSearchChange ?? (() => {})}
        placeholder="Filter by Keyword"
        onFilter={() => {}}
      />
    </div>
  );
}

// ─── Views & Markups ─────────────────────────────────────────────────────────

function ViewsToolbar() {
  const [query, setQuery] = useState('');
  return (
    <div className="px-4 py-2 border-b border-[#d6dadc]">
      <PanelSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search viewpoints"
        onFilter={() => {}}
      />
    </div>
  );
}

// ─── Drag-and-drop types + helpers ───────────────────────────────────────────

type DragTarget = { id: string; position: 'before' | 'after' | 'inside' };

const DEFAULT_RENDER_TOGGLES: RenderToggles = { mesh: true, lines: true, terrain: true, pointCloud: true };


function ViewsContent() {
  const adapter = useViewerAdapter();
  const viewpoints = useViewpoints();
  const toast = useToast();
  const { customViews, folders } = viewpoints;
  const { isXRayActive, renderToggles, setXRay, setRenderToggles } = useViewerSettings();

  const views = useMemo<ViewData[]>(
    () => customViews.map((vp) => ({
      id: vp.id,
      name: vp.name,
      folderId: vp.folderId ?? null,
      cameraPosition: vp.cameraPosition,
      cameraTarget: vp.cameraTarget,
      isOrthographic: vp.isOrthographic,
      markups: vp.markups,
      createdAt: vp.createdAt,
      isProjectView: false,
    })),
    [customViews],
  );

  // Local copies drive visual drag-and-drop order; sync from context on external changes.
  const [localViews, setLocalViews] = useState<ViewData[]>(views);
  useEffect(() => { setLocalViews(views); }, [views]);
  const [localFolders, setLocalFolders] = useState<ViewpointFolder[]>(folders);
  useEffect(() => { setLocalFolders(folders); }, [folders]);

  // Restore selection from adapter if a view-mode session is already active on mount
  // (e.g. React StrictMode double-invoke, or panel reopened during an active mode).
  const [selectedItemId, setSelectedItemId] = useState<string | null>(() => {
    if (adapter.isMarkupModeActive?.()) return adapter.getMarkupViewId?.() ?? null;
    if (adapter.isSectioningViewModeActive?.()) return adapter.getSectioningViewId?.() ?? null;
    return null;
  });
  // Checkbox state is independent from row selection for viewpoints.
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  // Folders start collapsed.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moreMenu, setMoreMenu] = useState<{ x: number; y: number; viewId: string } | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createMenuPos, setCreateMenuPos] = useState({ x: 0, y: 0 });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DragTarget | null>(null);
  const [isMarkupMode, setIsMarkupMode] = useState(() => adapter.isMarkupModeActive?.() ?? false);
  const [isSxMode, setIsSxMode] = useState(() => adapter.isSectioningViewModeActive?.() ?? false);
  const [dirtyViewId, setDirtyViewId] = useState<string | null>(null);
  /** ID of a view auto-created when entering sectioning view mode with no view selected. */
  const [autoSxViewId, setAutoSxViewId] = useState<string | null>(
    () => adapter.getAutoSectioningViewId?.() ?? null,
  );
  const closeCreateMenu = useCallback(() => setCreateMenuOpen(false), []);
  const closeMoreMenu = useCallback(() => setMoreMenu(null), []);

  // ── Folder expand/collapse ─────────────────────────────────────────────────
  const handleToggleFolder = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // ── Checkbox handlers ──────────────────────────────────────────────────────
  const handleViewChecked = useCallback((id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }, []);

  // Recursively collect all descendant view IDs for a folder (across all nesting levels).
  const getDescendantViewIds = useCallback((folderId: string): string[] => {
    const directViews = localViews.filter((v) => v.folderId === folderId).map((v) => v.id);
    const childFolderIds = localFolders.filter((f) => (f.parentFolderId ?? null) === folderId).map((f) => f.id);
    return [...directViews, ...childFolderIds.flatMap((id) => getDescendantViewIds(id))];
  }, [localViews, localFolders]);

  const handleFolderChecked = useCallback((folderId: string, checked: boolean) => {
    const descendantIds = getDescendantViewIds(folderId);
    setCheckedIds((prev) => {
      const next = new Set(prev);
      descendantIds.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  }, [getDescendantViewIds]);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Cooldown prevents camera-change during the restore animation from marking the row dirty.
  const restoringUntilRef = useRef<number>(0);
  // Stable refs for use inside event listeners (avoids stale closures).
  const customViewsRef = useRef(customViews);
  useEffect(() => { customViewsRef.current = customViews; }, [customViews]);
  // Holds freshly-saved markups keyed by viewId. Populated synchronously when
  // the markup commit fires (before the async server round-trip), so that
  // clicking back to the view immediately shows the NEW markups instead of the
  // stale version still in customViews. Cleared per-view after the server save
  // + refreshCustomViews() confirms the data is durable.
  const recentMarkupSavesRef = useRef<Map<string, import('../viewer-adapter/types').MarkupData[]>>(new Map());
  const viewpointsRef = useRef(viewpoints);
  useEffect(() => { viewpointsRef.current = viewpoints; }, [viewpoints]);
  const selectedItemIdRef = useRef<string | null>(null);
  useEffect(() => { selectedItemIdRef.current = selectedItemId; }, [selectedItemId]);
  const dirtyViewIdRef = useRef<string | null>(null);
  useEffect(() => { dirtyViewIdRef.current = dirtyViewId; }, [dirtyViewId]);
  const isMarkupModeRef = useRef(isMarkupMode);
  useEffect(() => { isMarkupModeRef.current = isMarkupMode; }, [isMarkupMode]);
  const isSxModeRef = useRef(isSxMode);
  useEffect(() => { isSxModeRef.current = isSxMode; }, [isSxMode]);
  const autoSxViewIdRef = useRef<string | null>(null);
  useEffect(() => { autoSxViewIdRef.current = autoSxViewId; }, [autoSxViewId]);
  useEffect(() => { adapter.setAutoSectioningViewId?.(autoSxViewId); }, [adapter, autoSxViewId]);
  /** Guards the async sectioning-mode auto-create similarly. */
  const autoSxCreateInFlightRef = useRef(false);
  // Stable refs so the auto-create async body always reads the latest values
  // without those values appearing in the effect's dependency array (which would
  // re-trigger the effect as the context updates after the view is added).
  const isXRayActiveRef = useRef(isXRayActive);
  useEffect(() => { isXRayActiveRef.current = isXRayActive; }, [isXRayActive]);
  const renderTogglesRef = useRef(renderToggles);
  useEffect(() => { renderTogglesRef.current = renderToggles; }, [renderToggles]);

  // ── Camera change → mark row dirty + hide stale markup overlay ───────────
  useEffect(() => {
    const unsub = adapter.subscribeCameraChange?.(() => {
      if (Date.now() < restoringUntilRef.current) return;
      // In markup mode the user cannot orbit — any camera-change is from a
      // programmatic setViewpointState restore, not a user pan/orbit. Never
      // dirty the row or hide the overlay during an active markup session.
      if (adapter.isMarkupModeActive?.()) return;
      const sid = selectedItemIdRef.current;
      if (sid) {
        setDirtyViewId(sid);
        // Markup is tied to the saved camera angle — hide it once the user
        // moves away. Clicking the row again restores camera + overlay.
        adapter.hideMarkupOverlay?.();
      } else {
        adapter.hideMarkupOverlay?.();
      }
    });
    return () => { unsub?.(); };
  }, [adapter]);

  // ── Sectioning change → mark row dirty + hide stale markup overlay ───────
  // Guarded by restoringUntilRef so that restoring a view with saved sectioning
  // (or activating the mode itself) doesn't immediately flag the row dirty.
  useEffect(() => {
    const unsub = adapter.subscribeSectioningState?.(() => {
      if (Date.now() < restoringUntilRef.current) return;
      // In markup mode the user cannot change sectioning — any change comes
      // from a programmatic setViewpointState restore. Don't dirty the row.
      if (adapter.isMarkupModeActive?.()) return;
      const sid = selectedItemIdRef.current;
      if (sid) {
        setDirtyViewId(sid);
        // Hide stale markup overlay only outside of either active session —
        // inside sectioning view mode the user is intentionally changing the
        // sectioning while markup may still be valid (markups only clear on
        // camera movement, not on sectioning changes).
        if (!adapter.isSectioningViewModeActive?.()) {
          adapter.hideMarkupOverlay?.();
        }
      }
    });
    return () => { unsub?.(); };
  }, [adapter]);

  // ── Visibility change → mark row dirty ───────────────────────────────────
  // Fires when objects are hidden/shown or "Clear All" is clicked in the flyout.
  // Guarded by restoringUntilRef so restoring a saved view's hiddenObjects list
  // doesn't immediately flag the row dirty.
  useEffect(() => {
    const unsub = adapter.subscribeVisibilityChange?.(() => {
      if (Date.now() < restoringUntilRef.current) return;
      if (adapter.isMarkupModeActive?.()) return;
      if (adapter.isSectioningViewModeActive?.()) return;
      const sid = selectedItemIdRef.current;
      if (sid) setDirtyViewId(sid);
    });
    return () => { unsub?.(); };
  }, [adapter]);

  // ── Markup strokes drawn → mark row dirty ────────────────────────────────
  // Guard with restoringUntilRef so that the initial loadMarkups() call inside
  // enterMarkupMode (which fires markups-changed) doesn't immediately dirty the
  // row before the user has drawn anything.
  useEffect(() => {
    const unsub = adapter.subscribeMarkupChange?.(() => {
      if (Date.now() < restoringUntilRef.current) return;
      const sid = selectedItemIdRef.current;
      if (sid) setDirtyViewId(sid);
    });
    return () => { unsub?.(); };
  }, [adapter]);

  // ── Render settings (xray / render toggles) change → mark row dirty ──────
  // Uses the same restore cooldown to avoid false positives during view restoration.
  useEffect(() => {
    if (Date.now() < restoringUntilRef.current) return;
    const sid = selectedItemIdRef.current;
    if (sid) setDirtyViewId(sid);
  }, [isXRayActive, renderToggles]);

  // ── Markup mode active state ─────────────────────────────────────────────
  useEffect(() => {
    const unsub = adapter.subscribeMarkupModeActive?.((active) => {
      setIsMarkupMode(active);
      isMarkupModeRef.current = active; // keep ref in sync synchronously (useEffect is too late)
      if (active) {
        // If the toolbar markup button was clicked (no viewId wired in the adapter)
        // but a view row is already selected, re-enter markup mode scoped to that
        // view so the editable canvas loads its existing markups.
        // getMarkupViewId() returns null when enterMarkupMode was called without a
        // viewId (toolbar path), as opposed to the pencil-button path which always
        // passes a viewId.
        if (!adapter.getMarkupViewId?.() && selectedItemIdRef.current) {
          const sid = selectedItemIdRef.current;
          const vp = customViewsRef.current.find((v) => v.id === sid);
          if (vp) {
            const freshMarkups = recentMarkupSavesRef.current.get(sid) ?? vp.markups;
            restoringUntilRef.current = Date.now() + 900;
            adapter.enterMarkupMode?.(sid, freshMarkups);
          }
        }
        return;
      }
      // active === false
      setDirtyViewId(null);
    });
    return () => { unsub?.(); };
  }, [adapter, viewpoints]);


  // ── Markup session commit — called directly by the adapter when saving ──────
  useEffect(() => {
    const unsub = adapter.registerMarkupCommitCallback?.((dirty) => {
      // Synchronously stash the new markups so that any click-back that happens
      // before the async server round-trip sees the fresh data, not the stale
      // version still held in customViews.
      for (const { viewId, markups } of dirty) {
        recentMarkupSavesRef.current.set(
          viewId,
          markups as import('../viewer-adapter/types').MarkupData[],
        );
      }
      // Sequential writes prevent a server-side read-modify-write race: if both
      // POSTs are in-flight simultaneously the second one reads the pre-first-write
      // file and overwrites the first view's markups.
      (async () => {
        for (const { viewId, markups } of dirty) {
          const vp = customViewsRef.current.find((v) => v.id === viewId);
          if (!vp) { recentMarkupSavesRef.current.delete(viewId); continue; }
          await viewpoints.updateCustomView(viewId, {
            ...vp,
            markups: markups as import('../viewer-adapter/types').MarkupData[],
          });
          // Server round-trip complete — customViews is now up to date, so
          // the optimistic cache entry is no longer needed.
          recentMarkupSavesRef.current.delete(viewId);
          // Re-show the overlay if this view is still selected.
          if (selectedItemIdRef.current === viewId && markups.length > 0) {
            adapter.showMarkupOverlay?.(markups, true);
          }
        }
      })();
    });
    return () => { unsub?.(); };
  }, [adapter, viewpoints]);

  // ── Sectioning view mode active state ────────────────────────────────────
  useEffect(() => {
    const unsub = adapter.subscribeSectioningViewModeActive?.((active) => {
      setIsSxMode(active);
      isSxModeRef.current = active; // keep ref in sync synchronously (useEffect is too late)
      if (active) {
        // Suppress the spurious dirty+hide-overlay triggered by emitSectioningState
        // being called the moment the mode activates (sectioningActive: false → true).
        restoringUntilRef.current = Date.now() + 500;
        // If a view is already selected when the mode activates (e.g. toolbar button
        // clicked while a view row was active), register it as the current sx view so
        // that Save correctly drafts and commits it.  The adapter's enterSectioningViewMode
        // else-branch sets sxViewId without drafting when sxViewId was previously null.
        // Register the already-selected view directly — do NOT call
        // enterSectioningViewMode() here because we're currently inside
        // the sxListeners.forEach() fired by that outer call, and re-entering
        // it would cause the outer call's post-listener code to draft the view
        // (with no section box yet) and then reset sxViewId to null.
        if (selectedItemIdRef.current) {
          adapter.setSectioningViewId?.(selectedItemIdRef.current);
        }
      }
      if (!active) {
        setDirtyViewId(null);
        autoSxCreateInFlightRef.current = false;
        // Red X path — delete the auto-created view (was never committed).
        const autoId = autoSxViewIdRef.current;
        if (autoId) {
          setAutoSxViewId(null);
          autoSxViewIdRef.current = null;
          viewpoints.deleteCustomView(autoId);
        }
        // The subscribeSectioningState exit event hides the markup overlay.
        // Re-show it for the currently-selected view so the user doesn't lose
        // their markup context on mode exit.
        const sid = selectedItemIdRef.current;
        if (sid) {
          const vp = customViewsRef.current.find((v) => v.id === sid);
          const freshMarkups = recentMarkupSavesRef.current.get(sid) ?? vp?.markups;
          if (freshMarkups && freshMarkups.length > 0) {
            adapter.showMarkupOverlay?.(freshMarkups, true);
          }
        }
      }
    });
    return () => { unsub?.(); };
  }, [adapter, viewpoints]);

  // ── Sectioning view mode: auto-create a view when entered with no selection ─
  useEffect(() => {
    if (!isSxMode) {
      autoSxCreateInFlightRef.current = false;
      return;
    }
    if (selectedItemIdRef.current) return;
    if (autoSxViewIdRef.current) return;
    if (autoSxCreateInFlightRef.current) return;
    autoSxCreateInFlightRef.current = true;
    (async () => {
      const state = adapter.getViewpointState?.();
      if (!state) { autoSxCreateInFlightRef.current = false; return; }
      const now = Date.now();
      const viewpoint: Viewpoint = {
        id: `view-${now}`,
        name: `View ${customViewsRef.current.length + 1}`,
        cameraPosition: state.camera.position,
        cameraTarget: state.camera.target,
        isOrthographic: state.camera.isOrthographic,
        hiddenObjects: state.hiddenObjects,
        sectioning: state.sectioning,
        markups: [],
        createdAt: now,
        isXRayActive: isXRayActiveRef.current,
        renderToggles: renderTogglesRef.current,
      };
      const result = await viewpointsRef.current.addCustomView(viewpoint);
      if (!result.ok) { autoSxCreateInFlightRef.current = false; return; }
      adapter.enterSectioningViewMode?.(viewpoint.id);
      autoSxViewIdRef.current = viewpoint.id;
      setAutoSxViewId(viewpoint.id);
      setSelectedItemId(viewpoint.id);
      restoringUntilRef.current = Date.now() + 700;
    })();
  }, [isSxMode, adapter]);

  // ── Sectioning session commit ────────────────────────────────────────────
  useEffect(() => {
    const unsub = adapter.registerSectioningViewCommitCallback?.((dirty) => {
      const autoId = autoSxViewIdRef.current;
      (async () => {
        for (const { viewId, camera, sectioning } of dirty) {
          const vp = customViewsRef.current.find((v) => v.id === viewId);
          if (!vp) continue;
          await viewpointsRef.current.updateCustomView(viewId, {
            ...vp,
            cameraPosition: camera.position,
            cameraTarget: camera.target,
            isOrthographic: camera.isOrthographic,
            sectioning: sectioning ?? null,
            markups: vp.markups ?? [],
          });
          // exitSectioningViewMode clears the section box from the renderer even
          // on the save path. Re-apply the saved state immediately so the user
          // sees their sectioning without having to click off and back to the view.
          if (selectedItemIdRef.current === viewId) {
            adapter.setViewpointState?.(
              { camera, hiddenObjects: vp.hiddenObjects, sectioning: sectioning ?? null },
              { animate: false },
            );
          }
        }
        if (autoId) {
          setAutoSxViewId(null);
          autoSxViewIdRef.current = null;
        }
      })();
    });
    return () => { unsub?.(); };
  }, [adapter, viewpoints]);

  // ── Create viewpoint (triggered by orange + in panel header) ──────────────
  const handleSaveView = useCallback(async () => {
    const state = adapter.getViewpointState?.();
    if (!state) {
      toast.show({ kind: 'error', message: 'Cannot capture view state.' });
      return;
    }
    const now = Date.now();
    const viewpoint: Viewpoint = {
      id: `view-${now}`,
      name: `View ${customViews.length + 1}`,
      cameraPosition: state.camera.position,
      cameraTarget: state.camera.target,
      isOrthographic: state.camera.isOrthographic,
      hiddenObjects: state.hiddenObjects,
      sectioning: state.sectioning,
      markups: [],
      createdAt: now,
      isXRayActive,
      renderToggles,
    };
    const result = await viewpoints.addCustomView(viewpoint);
    if (result.ok) {
      toast.show({ kind: 'success', message: `"${viewpoint.name}" saved.` });
    } else if (result.reason === 'writer-unavailable') {
      toast.show({ kind: 'error', message: 'Saving views is only available when running locally.' });
    } else {
      toast.show({ kind: 'error', message: 'Failed to save view. Try again.' });
    }
  }, [adapter, customViews, viewpoints, toast, isXRayActive, renderToggles]);

  useEffect(() => {
    const handler = () => {
      const btn = document.querySelector('[data-add="views"]');
      if (btn) {
        const rect = btn.getBoundingClientRect();
        setCreateMenuPos({ x: rect.right, y: rect.bottom + 6 });
      }
      setCreateMenuOpen((prev) => !prev);
    };
    window.addEventListener('mv:views-open-create', handler);
    return () => window.removeEventListener('mv:views-open-create', handler);
  }, []);


  // ── Select / restore view ─────────────────────────────────────────────────
  const handleSelectView = useCallback((id: string) => {
    clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      const vp = customViews.find((v) => v.id === id);
      if (!vp) return;

      if (isMarkupModeRef.current) {
        // In markup mode: auto-draft current view's markups, switch to the clicked view.
        setSelectedItemId(id);
        restoringUntilRef.current = Date.now() + 900;
        adapter.setViewpointState?.(
          { camera: { position: vp.cameraPosition, target: vp.cameraTarget, isOrthographic: vp.isOrthographic }, hiddenObjects: vp.hiddenObjects, sectioning: vp.sectioning },
          { animate: true },
        );
        adapter.enterMarkupMode?.(id, vp.markups);
        return;
      }

      if (isSxModeRef.current) {
        // If the user is switching away from an auto-created view, delete it.
        const autoId = autoSxViewIdRef.current;
        if (autoId && id !== autoId) {
          viewpoints.deleteCustomView(autoId);
          setAutoSxViewId(null);
          autoSxViewIdRef.current = null;
        }
        // IMPORTANT: draft the current view BEFORE restoring the new view's state.
        // enterSectioningViewMode reads viewer.sectioning.serializeState() to capture
        // the outgoing view's sectioning — if setViewpointState runs first it would
        // restore the incoming view's sectioning and corrupt the outgoing draft.
        adapter.enterSectioningViewMode?.(id);
        setSelectedItemId(id);
        setDirtyViewId(null);
        restoringUntilRef.current = Date.now() + 900;
        adapter.setViewpointState?.(
          { camera: { position: vp.cameraPosition, target: vp.cameraTarget, isOrthographic: vp.isOrthographic }, hiddenObjects: vp.hiddenObjects, sectioning: vp.sectioning },
          { animate: true },
        );
        {
          const freshMarkups = recentMarkupSavesRef.current.get(id) ?? vp.markups;
          if (freshMarkups && freshMarkups.length > 0) {
            adapter.showMarkupOverlay?.(freshMarkups, true);
          } else {
            adapter.hideMarkupOverlay?.();
          }
        }
        return;
      }

      if (id === selectedItemId) {
        // Use the ref so we always read the live dirty state, not a stale closure value.
        if (id === dirtyViewIdRef.current) {
          // Dirty row clicked again — re-apply the saved viewpoint state to undo
          // any unsaved camera / sectioning changes, then stay selected.
          setDirtyViewId(null);
          restoringUntilRef.current = Date.now() + 900;
          adapter.setViewpointState?.(
            {
              camera: { position: vp.cameraPosition, target: vp.cameraTarget, isOrthographic: vp.isOrthographic },
              hiddenObjects: vp.hiddenObjects,
              sectioning: vp.sectioning,
            },
            { animate: true },
          );
          // Force-clear dirty again after the camera animation finishes (550ms)
          // so any intermediate event that re-set it doesn't leave the row grey.
          setTimeout(() => {
            if (selectedItemIdRef.current === id) setDirtyViewId(null);
          }, 660);
          {
            const freshMarkups = recentMarkupSavesRef.current.get(id) ?? vp.markups;
            if (freshMarkups && freshMarkups.length > 0) {
              adapter.showMarkupOverlay?.(freshMarkups, true);
            } else {
              adapter.hideMarkupOverlay?.();
            }
          }
        } else {
          // Not dirty — toggle deselect.
          setSelectedItemId(null);
          setDirtyViewId(null);
          adapter.hideMarkupOverlay?.();
        }
        return;
      }
      setSelectedItemId(id);
      setDirtyViewId(null);
      restoringUntilRef.current = Date.now() + 900;
      adapter.setViewpointState?.(
        {
          camera: { position: vp.cameraPosition, target: vp.cameraTarget, isOrthographic: vp.isOrthographic },
          hiddenObjects: vp.hiddenObjects,
          sectioning: vp.sectioning,
        },
        { animate: true },
      );
      // Belt-and-suspenders: clear dirty again after the camera animation (550ms)
      // in case any intermediate event (camera-change damping, sectioning restore)
      // re-set the dirty flag before the cooldown could block it.
      const viewId = id;
      setTimeout(() => {
        if (selectedItemIdRef.current === viewId) setDirtyViewId(null);
      }, 660);
      // Restore render settings (xray + render toggles) saved with this view.
      setXRay(vp.isXRayActive ?? false);
      setRenderToggles(vp.renderToggles ?? DEFAULT_RENDER_TOGGLES);
      // Show the view's saved markups as a read-only overlay once the camera settles.
      // Prefer the optimistic cache (populated synchronously at commit time) over the
      // potentially-stale file-backed customViews to handle the case where the user
      // clicks away and back before the async server round-trip completes.
      {
        const freshMarkups = recentMarkupSavesRef.current.get(id) ?? vp.markups;
        if (freshMarkups && freshMarkups.length > 0) {
          adapter.showMarkupOverlay?.(freshMarkups, true);
        } else {
          adapter.hideMarkupOverlay?.();
        }
      }
    }, 250);
  }, [adapter, customViews, selectedItemId, viewpoints, setXRay, setRenderToggles]);

  // ── Enter markup mode for a specific view row ─────────────────────────────
  const handleMarkupClick = useCallback((viewId: string) => {
    const vp = customViews.find((v) => v.id === viewId);
    if (!vp) return;
    // Cancel any pending row-click deselect timer. The pencil button calls
    // stopPropagation() so handleSelectView won't re-fire, but a prior row click
    // may have started a 250ms toggle-deselect timer that would otherwise fire
    // AFTER enterMarkupMode and unexpectedly clear selectedItemId.
    clearTimeout(clickTimerRef.current);
    setSelectedItemId(viewId);
    setDirtyViewId(null);
    // 900ms cooldown — long enough to cover the 550ms camera restore animation
    // plus any trailing camera-change or sectioning events.
    restoringUntilRef.current = Date.now() + 900;
    adapter.hideMarkupOverlay?.();
    adapter.setViewpointState?.(
      { camera: { position: vp.cameraPosition, target: vp.cameraTarget, isOrthographic: vp.isOrthographic }, hiddenObjects: vp.hiddenObjects, sectioning: vp.sectioning },
      { animate: true },
    );
    // Prefer the optimistic cache populated synchronously at commit time — the
    // async server round-trip may not have updated customViews yet, so vp.markups
    // could still be stale (e.g. empty) even though the overlay was already showing
    // the correct markups via recentMarkupSavesRef.
    const freshMarkups = recentMarkupSavesRef.current.get(viewId) ?? vp.markups;
    // Call enterMarkupMode directly — the indirect window.dispatchEvent path
    // through RightToolbar was losing the viewId association in the adapter,
    // causing the editable canvas to show blank and markups to be saved to the
    // wrong view. The RightToolbar UI syncs via its subscribeMarkupModeActive
    // subscription instead.
    adapter.enterMarkupMode?.(viewId, freshMarkups);
  }, [adapter, customViews, viewpoints]);

  // ── Drag and drop ──────────────────────────────────────────────────────────
  const handleDragStart = useCallback((id: string) => { setDraggingId(id); }, []);
  const handleDragEnd = useCallback(() => { setDraggingId(null); setDropTarget(null); }, []);

  const handleDragOver = useCallback((id: string, position: 'before' | 'after' | 'inside') => {
    if (!draggingId || id === draggingId) return;
    setDropTarget({ id, position });
  }, [draggingId]);

  const handleDragLeave = useCallback((id: string) => {
    setDropTarget((prev) => (prev?.id === id ? null : prev));
  }, []);

  const handleDrop = useCallback((targetId: string) => {
    if (!draggingId || !dropTarget || dropTarget.id !== targetId) return;
    const { position } = dropTarget;

    // ── Folder being dragged ───────────────────────────────────────────────
    const draggingFolder = localFolders.find((f) => f.id === draggingId);
    if (draggingFolder) {
      // Circular reference guard: can't drop a folder into its own descendant.
      const isDescendant = (ancestorId: string, nodeId: string): boolean => {
        let current: string | null | undefined = nodeId;
        while (current) {
          if (current === ancestorId) return true;
          current = localFolders.find((f) => f.id === current)?.parentFolderId;
        }
        return false;
      };

      if (position === 'inside') {
        // Drop onto a folder header: nest dragging folder inside target, placed
        // at the bottom of the target's existing sub-folders.
        if (!localFolders.some((f) => f.id === targetId)) { setDraggingId(null); setDropTarget(null); return; }
        if (isDescendant(draggingId, targetId)) { setDraggingId(null); setDropTarget(null); return; }

        const without = localFolders.filter((f) => f.id !== draggingId);
        const moved = { ...draggingFolder, parentFolderId: targetId };
        // Find the last existing sub-folder of the target and insert after it.
        // If none exist, insert right after the target folder itself.
        const siblings = without.filter((f) => (f.parentFolderId ?? null) === targetId);
        const anchor = siblings.length > 0 ? siblings[siblings.length - 1] : without.find((f) => f.id === targetId);
        const insertIdx = anchor ? without.findIndex((f) => f.id === anchor.id) + 1 : without.length;
        without.splice(insertIdx, 0, moved);
        setLocalFolders(without);
        setDraggingId(null); setDropTarget(null);
        return;
      }

      // Drop before/after another folder: reorder among folders, inherit parentFolderId.
      // Drop before/after a view: snap to end of folders at that view's level.
      const targetFolder = localFolders.find((f) => f.id === targetId);
      const targetView = localViews.find((v) => v.id === targetId);
      const newParentFolderId = targetFolder ? (targetFolder.parentFolderId ?? null) : (targetView?.folderId ?? null);
      if (isDescendant(draggingId, newParentFolderId ?? '')) { setDraggingId(null); setDropTarget(null); return; }

      const without = localFolders.filter((f) => f.id !== draggingId);
      const moved = { ...draggingFolder, parentFolderId: newParentFolderId };

      if (targetFolder) {
        // Reorder among sibling folders.
        const targetIdx = without.findIndex((f) => f.id === targetId);
        without.splice(position === 'before' ? targetIdx : targetIdx + 1, 0, moved);
      } else {
        // Snap: insert after the last folder at this level (before first view).
        const sibling = without.filter((f) => (f.parentFolderId ?? null) === newParentFolderId);
        const lastSibling = sibling[sibling.length - 1];
        const insertIdx = lastSibling ? without.findIndex((f) => f.id === lastSibling.id) + 1 : 0;
        without.splice(insertIdx, 0, moved);
      }
      setLocalFolders(without);
      setDraggingId(null);
      setDropTarget(null);
      return;
    }

    // ── View being dragged ─────────────────────────────────────────────────
    let updated: ViewData[];

    if (position === 'inside') {
      // Drop onto a collapsed/empty folder: move the view into that folder.
      if (!localFolders.some((f) => f.id === targetId)) {
        setDraggingId(null); setDropTarget(null); return;
      }
      updated = localViews.map((v) => v.id === draggingId ? { ...v, folderId: targetId } : v);
    } else {
      // Drop before/after a view: reorder among views, inherit folderId.
      // Drop before/after a folder: snap to beginning of views at that folder's level.
      const targetView = localViews.find((v) => v.id === targetId);
      const targetFolder = localFolders.find((f) => f.id === targetId);
      const newFolderId = targetView ? (targetView.folderId ?? null) : (targetFolder?.parentFolderId ?? null);

      const draggingView = localViews.find((v) => v.id === draggingId);
      if (!draggingView) { setDraggingId(null); setDropTarget(null); return; }

      const without = localViews.filter((v) => v.id !== draggingId);
      const moved = { ...draggingView, folderId: newFolderId };

      if (targetView) {
        // Reorder among sibling views.
        const targetIdx = without.findIndex((v) => v.id === targetId);
        without.splice(position === 'before' ? targetIdx : targetIdx + 1, 0, moved);
      } else {
        // Snap: insert before the first view at this level (just after all folders).
        const firstViewIdx = without.findIndex((v) => (v.folderId ?? null) === newFolderId);
        if (firstViewIdx === -1) {
          without.push(moved);
        } else {
          without.splice(firstViewIdx, 0, moved);
        }
      }
      updated = without;
    }

    setLocalViews(updated);
    setDraggingId(null);
    setDropTarget(null);

    // Persist: use folderId from updated localViews, not from stale customViews.
    const reorderedViewpoints = updated
      .map((v) => {
        const vp = customViews.find((vp) => vp.id === v.id);
        return vp ? { ...vp, folderId: v.folderId } : null;
      })
      .filter((vp): vp is NonNullable<typeof vp> => vp !== null) as Viewpoint[];
    viewpoints.reorderCustomViews(reorderedViewpoints).then((result) => {
      if (!result.ok && result.reason === 'writer-unavailable') {
        toast.show({ kind: 'error', message: 'Reordering is only available when running locally.' });
      }
    });
  }, [draggingId, dropTarget, localViews, localFolders, customViews, viewpoints, toast]);

  // ── More menu (per-row actions) ────────────────────────────────────────────
  const handleMoreClick = useCallback((e: React.MouseEvent, viewId: string) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMoreMenu({ x: rect.right, y: rect.bottom + 4, viewId });
  }, []);


  const handleUpdate = useCallback(async () => {
    if (!moreMenu) return;
    const { viewId } = moreMenu;
    setMoreMenu(null);

    if (isMarkupMode) {
      // In markup mode the "Update" button acts as bulk-save — same as the
      // green checkmark. exitMarkupMode(true) triggers the registered commit
      // callback which persists all dirty views to ViewpointsContext.
      adapter.exitMarkupMode?.(true);
      window.dispatchEvent(new CustomEvent('mv:markup-exit'));
      return;
    }

    if (isSxMode) {
      // Same bulk-save semantics for sectioning view mode.
      adapter.exitSectioningViewMode?.(true);
      window.dispatchEvent(new CustomEvent('mv:sectioning-view-exit'));
      return;
    }

    const vp = customViews.find((v) => v.id === viewId);
    if (!vp) return;
    const state = adapter.getViewpointState?.();
    if (!state) {
      toast.show({ kind: 'error', message: 'Cannot capture view state.' });
      return;
    }
    const updated: Viewpoint = {
      ...vp,
      cameraPosition: state.camera.position,
      cameraTarget: state.camera.target,
      isOrthographic: state.camera.isOrthographic,
      hiddenObjects: state.hiddenObjects,
      sectioning: state.sectioning,
      // Preserve existing markups — out of markup mode, Update only refreshes the
      // camera/scene state and must not discard previously saved markup.
      markups: vp.markups ?? [],
      isXRayActive,
      renderToggles,
    };
    const result = await viewpoints.updateCustomView(vp.id, updated);
    if (result.ok) {
      setDirtyViewId(null);
      toast.show({ kind: 'success', message: `"${vp.name}" updated.` });
    } else if (result.reason === 'writer-unavailable') {
      toast.show({ kind: 'error', message: 'Updating is only available when running locally.' });
    } else {
      toast.show({ kind: 'error', message: 'Failed to update view. Try again.' });
    }
  }, [moreMenu, customViews, adapter, viewpoints, toast, isMarkupMode, isSxMode, isXRayActive, renderToggles]);

  const handleRenameFromMenu = useCallback(() => {
    if (!moreMenu) return;
    const view = localViews.find((v) => v.id === moreMenu.viewId);
    setRenamingId(moreMenu.viewId);
    setRenameValue(view?.name ?? '');
    setMoreMenu(null);
  }, [moreMenu, localViews]);

  const handleDeleteFromMenu = useCallback(async () => {
    if (!moreMenu) return;
    const { viewId } = moreMenu;
    setMoreMenu(null);
    if (selectedItemId === viewId) { setSelectedItemId(null); setDirtyViewId(null); }
    if (autoSxViewIdRef.current === viewId) { setAutoSxViewId(null); autoSxViewIdRef.current = null; }
    setCheckedIds((prev) => { const next = new Set(prev); next.delete(viewId); return next; });
    const result = await viewpoints.deleteCustomView(viewId);
    if (!result.ok && result.reason === 'writer-unavailable') {
      toast.show({ kind: 'error', message: 'Deleting is only available when running locally.' });
    }
  }, [moreMenu, selectedItemId, viewpoints, toast]);

  // ── Rename ────────────────────────────────────────────────────────────────
  const commitRename = useCallback(async () => {
    const id = renamingId;
    const name = renameValue.trim();
    setRenamingId(null);
    setRenameValue('');
    if (!id || !name) return;
    const result = await viewpoints.renameCustomView(id, name);
    if (!result.ok && result.reason === 'writer-unavailable') {
      toast.show({ kind: 'error', message: 'Renaming is only available when running locally.' });
    }
  }, [renamingId, renameValue, viewpoints, toast]);

  const handleDoubleClick = useCallback((id: string, currentName: string) => {
    clearTimeout(clickTimerRef.current);
    setRenamingId(id);
    setRenameValue(currentName);
  }, []);

  const cancelRename = useCallback(() => { setRenamingId(null); setRenameValue(''); }, []);

  const handleBackgroundClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-tree-node]')) return;
    setSelectedItemId(null);
  }, []);

  return (
    <div className="relative">
      {createMenuOpen && (
        <DropdownMenu position={createMenuPos} onClose={closeCreateMenu}>
          <DropdownMenuItem onClick={() => { closeCreateMenu(); handleSaveView(); }}>Create Viewpoint</DropdownMenuItem>
          <DropdownMenuItem disabled>Create Folder</DropdownMenuItem>
          <DropdownMenuItem disabled>Import Viewpoints</DropdownMenuItem>
        </DropdownMenu>
      )}

      <div className="bg-white rounded-md overflow-hidden py-1 relative min-h-full" onClick={handleBackgroundClick}>
        {localFolders.length === 0 && localViews.length === 0 && (
          <p className="px-3 py-6 text-sm text-gray-400 text-center">
            No saved views yet. Use the + button in the panel header to create one.
          </p>
        )}

        {/* Recursive folder + view tree */}
        {(() => {
          const renderViewRow = (view: ViewData, depth: number) => (
            <TreeNode
              key={view.id}
              id={view.id}
              label={view.name}
              depth={depth}
              type="leaf"
              checked={checkedIds.has(view.id)}
              onCheckedChange={handleViewChecked}
              selected={view.id === selectedItemId && view.id !== dirtyViewId}
              isDirty={view.id === dirtyViewId}
              hoverBg="#F4F5F6"
              showActionsOnHover
              isRenaming={renamingId === view.id}
              renameValue={renameValue}
              onRenameChange={setRenameValue}
              onRenameCommit={commitRename}
              onRenameCancel={cancelRename}
              onClick={handleSelectView}
              onDoubleClick={handleDoubleClick}
              draggable
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              isDragging={draggingId === view.id}
              dropIndicator={dropTarget?.id === view.id ? (dropTarget.position as 'before' | 'after') : undefined}
              actions={
                <>
                  <button
                    type="button"
                    title="Markup"
                    onClick={(e) => { e.stopPropagation(); handleMarkupClick(view.id); }}
                    onDoubleClick={(e) => e.stopPropagation()}
                    className="w-6 h-6 flex items-center justify-center rounded bg-[#E3E6E8] hover:bg-[#CDD1D4]"
                  >
                    <img src={editIcon} alt="" width={14} height={14} />
                  </button>
                  <button type="button" title="Share" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} className="w-6 h-6 flex items-center justify-center rounded bg-[#E3E6E8] hover:bg-[#CDD1D4]">
                    <img src={shareIcon} alt="" width={14} height={14} />
                  </button>
                  <button type="button" title="More" onClick={(e) => { e.stopPropagation(); handleMoreClick(e, view.id); }} onDoubleClick={(e) => e.stopPropagation()} className="w-6 h-6 flex items-center justify-center rounded bg-[#E3E6E8] hover:bg-[#CDD1D4]">
                    <img src={moreIcon} alt="" width={14} height={14} />
                  </button>
                </>
              }
            />
          );

          const renderFolder = (folder: ViewpointFolder, depth: number): React.ReactNode => {
            const descendantViewIds = getDescendantViewIds(folder.id);
            const checkedCount = descendantViewIds.filter((id) => checkedIds.has(id)).length;
            const allChecked = descendantViewIds.length > 0 && checkedCount === descendantViewIds.length;
            const indeterminate = checkedCount > 0 && !allChecked;
            const childFolders = localFolders.filter((f) => (f.parentFolderId ?? null) === folder.id);
            const directViews = localViews.filter((v) => v.folderId === folder.id);
            return (
              <TreeNode
                key={folder.id}
                id={folder.id}
                label={folder.name}
                depth={depth}
                type="folder"
                expanded={expandedIds.has(folder.id)}
                onToggle={handleToggleFolder}
                checked={allChecked}
                indeterminate={indeterminate}
                onCheckedChange={handleFolderChecked}
                hoverBg="#F4F5F6"
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                isDragging={draggingId === folder.id}
                isDropTarget={dropTarget?.id === folder.id && dropTarget.position === 'inside'}
                dropIndicator={dropTarget?.id === folder.id && dropTarget.position !== 'inside' ? (dropTarget.position as 'before' | 'after') : undefined}
              >
                {childFolders.map((f) => renderFolder(f, depth + 1))}
                {directViews.map((v) => renderViewRow(v, depth + 1))}
              </TreeNode>
            );
          };

          const rootFolders = localFolders.filter((f) => !(f.parentFolderId ?? null));
          const unfiledViews = localViews.filter((v) => !v.folderId);
          return (
            <>
              {rootFolders.map((f) => renderFolder(f, 0))}
              {unfiledViews.map((v) => renderViewRow(v, 0))}
            </>
          );
        })()}
      </div>

      {moreMenu && (
        <DropdownMenu position={{ x: moreMenu.x, y: moreMenu.y }} onClose={closeMoreMenu}>
          <DropdownMenuItem onClick={handleUpdate}>Update</DropdownMenuItem>
          <DropdownMenuItem onClick={handleRenameFromMenu}>Rename</DropdownMenuItem>
          <DropdownMenuItem disabled trailingIcon={<ChevronRight size={14} className="text-[#9DA7AD]" />}>Move to Folder</DropdownMenuItem>
          <DropdownMenuItem disabled>Add to Project Views</DropdownMenuItem>
          <DropdownMenuItem onClick={handleDeleteFromMenu}>Delete</DropdownMenuItem>
        </DropdownMenu>
      )}
    </div>
  );
}

// ─── Sheets ──────────────────────────────────────────────────────────────────

interface SheetFolder {
  id: string;
  name: string; // breadcrumb label e.g. "Building A > Level 01"
}

interface SheetData {
  id: string;
  folderId: string;
  number: string; // e.g. "A-101"
  name: string;   // e.g. "Architectural Floor Plan"
  status: 'Approved' | 'Approved with Comments';
  version: string; // e.g. "Version 4"
}

const SHEET_FOLDERS: SheetFolder[] = [
  { id: 'sf-a-l01', name: 'Building A > Level 01' },
  { id: 'sf-a-l02', name: 'Building A > Level 02' },
  { id: 'sf-b-l01', name: 'Building B > Level 01' },
  { id: 'sf-b-l02', name: 'Building B > Level 02' },
];

const SHEETS: SheetData[] = [
  // Building A > Level 01
  { id: 's-a-l01-01', folderId: 'sf-a-l01', number: 'A-101', name: 'Architectural Floor Plan',  status: 'Approved',                version: 'Version 4' },
  { id: 's-a-l01-02', folderId: 'sf-a-l01', number: 'A-102', name: 'Reflected Ceiling Plan',    status: 'Approved',                version: 'Version 2' },
  { id: 's-a-l01-03', folderId: 'sf-a-l01', number: 'A-103', name: 'Room Finish Schedule',      status: 'Approved with Comments',  version: 'Version 1' },
  { id: 's-a-l01-04', folderId: 'sf-a-l01', number: 'S-101', name: 'Structural Framing Plan',   status: 'Approved with Comments',  version: 'Version 3' },

  // Building A > Level 02
  { id: 's-a-l02-01', folderId: 'sf-a-l02', number: 'A-201', name: 'Floor Plan',                status: 'Approved',                version: 'Version 5' },
  { id: 's-a-l02-02', folderId: 'sf-a-l02', number: 'A-202', name: 'Reflected Ceiling Plan',    status: 'Approved with Comments',  version: 'Version 1' },
  { id: 's-a-l02-03', folderId: 'sf-a-l02', number: 'M-201', name: 'Mechanical Layout',         status: 'Approved',                version: 'Version 2' },
  { id: 's-a-l02-04', folderId: 'sf-a-l02', number: 'E-201', name: 'Electrical Plan',           status: 'Approved with Comments',  version: 'Version 2' },

  // Building B > Level 01
  { id: 's-b-l01-01', folderId: 'sf-b-l01', number: 'A-101', name: 'Architectural Floor Plan',  status: 'Approved',                version: 'Version 3' },
  { id: 's-b-l01-02', folderId: 'sf-b-l01', number: 'S-101', name: 'Foundation Plan',           status: 'Approved',                version: 'Version 2' },
  { id: 's-b-l01-03', folderId: 'sf-b-l01', number: 'M-101', name: 'Plumbing Layout',           status: 'Approved with Comments',  version: 'Version 1' },
  { id: 's-b-l01-04', folderId: 'sf-b-l01', number: 'E-101', name: 'Electrical Single Line',    status: 'Approved with Comments',  version: 'Version 1' },

  // Building B > Level 02
  { id: 's-b-l02-01', folderId: 'sf-b-l02', number: 'A-201', name: 'Floor Plan',                status: 'Approved',                version: 'Version 2' },
  { id: 's-b-l02-02', folderId: 'sf-b-l02', number: 'A-202', name: 'Ceiling Plan',              status: 'Approved with Comments',  version: 'Version 1' },
  { id: 's-b-l02-03', folderId: 'sf-b-l02', number: 'S-201', name: 'Structural Framing',        status: 'Approved',                version: 'Version 4' },
];

// SheetsToolbar renders nothing — search lives inside SheetsContent so it can filter the list.
function SheetsToolbar() {
  return null;
}

function SheetsContent() {
  const [query, setQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(SHEET_FOLDERS.map((f) => f.id))
  );
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHEET_FOLDERS.map((f) => ({ folder: f, sheets: SHEETS.filter((s) => s.folderId === f.id) }));
    return SHEET_FOLDERS
      .map((f) => ({
        folder: f,
        sheets: SHEETS.filter(
          (s) => s.folderId === f.id && `${s.number} ${s.name}`.toLowerCase().includes(q)
        ),
      }))
      .filter(({ sheets }) => sheets.length > 0);
  }, [query]);

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleSheetChecked = useCallback((id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }, []);

  const handleFolderChecked = useCallback((folderId: string, checked: boolean) => {
    const folderSheetIds = SHEETS.filter((s) => s.folderId === folderId).map((s) => s.id);
    setCheckedIds((prev) => {
      const next = new Set(prev);
      folderSheetIds.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-4 py-2 border-b border-[#d6dadc] bg-white">
        <PanelSearchBar value={query} onChange={setQuery} placeholder="Search sheets" />
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto bg-white">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-sm text-gray-400 text-center">No sheets found.</p>
        ) : (
          filtered.map(({ folder, sheets }) => {
            const checkedCount = sheets.filter((s) => checkedIds.has(s.id)).length;
            const allChecked = sheets.length > 0 && checkedCount === sheets.length;
            return (
              <TreeNode
                key={folder.id}
                id={folder.id}
                label={folder.name}
                depth={0}
                type="folder"
                expanded={expandedIds.has(folder.id)}
                onToggle={handleToggle}
                checked={allChecked}
                indeterminate={checkedCount > 0 && !allChecked}
                onCheckedChange={handleFolderChecked}
                selected={allChecked}
                hideFolderIcon
                labelBold
              >
                {sheets.map((sheet) => (
                  <TreeNode
                    key={sheet.id}
                    id={sheet.id}
                    label={`${sheet.number} ${sheet.name}`}
                    subtitle={`${sheet.status} · ${sheet.version}`}
                    depth={1}
                    type="leaf"
                    checked={checkedIds.has(sheet.id)}
                    onCheckedChange={handleSheetChecked}
                    selected={checkedIds.has(sheet.id)}
                    onClick={(id) => handleSheetChecked(id, true)}
                    actions={
                      <button
                        type="button"
                        aria-label="More options"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-black/5 text-[#6A767C]"
                      >
                        <MoreVertical size={14} />
                      </button>
                    }
                  />
                ))}
              </TreeNode>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Deviation ───────────────────────────────────────────────────────────────

function DeviationContent() {
  return (
    <p className="px-3 py-6 text-sm text-gray-400 text-center">
      No deviation data available.
    </p>
  );
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const PANEL_REGISTRY: Record<PanelId, { Content: () => ReactElement | null; Toolbar?: () => ReactElement | null }> = {
  'views':       { Content: ViewsContent, Toolbar: ViewsToolbar },
  'items':       { Content: ItemsContent },
  'sheets':      { Content: SheetsContent, Toolbar: SheetsToolbar },
  'object-tree': { Content: ObjectTreeContent, Toolbar: ObjectTreeToolbar },
  'properties':  { Content: PropertiesContent, Toolbar: PropertiesToolbar },
  'search-sets': { Content: SearchSetsContent, Toolbar: SearchSetsToolbar },
  'deviation':   { Content: DeviationContent },
};
