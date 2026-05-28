import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  AlertTriangle,
  Binoculars,
  ClipboardList,
  FileQuestion,
  Home,
  ListChecks,
  Plus,
  ShieldCheck,
  Wrench,
  ChevronRight,
  ChevronDown,
  Check,
  Star,
} from 'lucide-react';
import { useViewerAdapter } from '../viewer-adapter/ViewerAdapterContext';
import type { SearchSet, ViewData, PropertyGroup, ObjectProperty } from '../viewer-adapter/types';
import { TreeNode } from '../../shared/TreeNode';
import type { PanelId } from './useDockStore';
import { useViewpoints } from '../viewpoints';
import type { Viewpoint } from '../viewpoints';
import { useToast } from '../toast/ToastContext';
import searchFieldIcon from '../../assets/icons/panel/searchField.svg';
import filterButtonIcon from '../../assets/icons/panel/filterButton.svg';
import propertiesEmptyIllustration from '../../assets/icons/panel/properties-empty.svg';

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

function SearchSetsContent() {
  const adapter = useViewerAdapter();
  const [searchSets, setSearchSets] = useState<SearchSet[]>([]);

  useEffect(() => {
    setSearchSets(adapter.getSearchSets?.() ?? []);
  }, [adapter]);

  const handleRun = (id: string) => adapter.executeSearchSet?.(id);
  const handleDelete = (id: string) => {
    adapter.deleteSearchSet?.(id);
    setSearchSets((prev) => prev.filter((s) => s.id !== id));
  };

  if (searchSets.length === 0) {
    return (
      <p className="px-3 py-6 text-sm text-gray-400 text-center">No saved searches</p>
    );
  }

  return (
    <ul className="bg-white rounded-md overflow-hidden">
      {searchSets.map((set) => (
        <li
          key={set.id}
          className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0"
        >
          <span className="text-sm text-gray-700 truncate flex-1 mr-2">{set.name}</span>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => handleRun(set.id)}
              className="px-2 py-0.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded"
            >
              Run
            </button>
            <button
              onClick={() => handleDelete(set.id)}
              className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-red-100 hover:text-red-600 text-gray-500 rounded"
            >
              Del
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Related Items ────────────────────────────────────────────────────────────

const ITEMS = [
  { label: 'Assets', Icon: Home },
  { label: 'Coordination Issues', Icon: AlertTriangle },
  { label: 'Punch List', Icon: Wrench },
  { label: 'Quality Inspections', Icon: ClipboardList },
  { label: 'Quality Observation', Icon: Binoculars },
  { label: 'RFIs', Icon: FileQuestion },
  { label: 'Safety Inspections', Icon: ShieldCheck },
  { label: 'Safety Observation', Icon: Binoculars },
  { label: 'Submittals', Icon: ListChecks },
] as const;

function ItemsContent() {
  return (
    <ul className="bg-white rounded-md overflow-hidden px-2 py-1">
      {ITEMS.map(({ label, Icon }) => (
        <li key={label}>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md px-2 py-[11px] text-left transition-colors hover:bg-gray-100"
          >
            <span className="flex items-center gap-3 text-sm font-semibold text-gray-700">
              <Icon size={16} strokeWidth={2} className="text-gray-600" />
              {label}
            </span>
            <span className="pr-1 text-xl leading-none text-gray-400">›</span>
          </button>
        </li>
      ))}
    </ul>
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
  onToggleChecked: (node: ObjNode, checked: boolean) => void;
  onToggleExpanded: (nodeId: string) => void;
}

function ObjTreeNode({
  node,
  depth = 0,
  checkedIds,
  expandedIds,
  loadingIds,
  onToggleChecked,
  onToggleExpanded,
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
    >
      {node.children?.map((child) => (
        <ObjTreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          checkedIds={checkedIds}
          expandedIds={expandedIds}
          loadingIds={loadingIds}
          onToggleChecked={onToggleChecked}
          onToggleExpanded={onToggleExpanded}
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
        <div className="py-1">
          {objectTreeNodes.map((node) => (
            <ObjTreeNode
              key={node.id}
              node={node}
              depth={0}
              checkedIds={checkedIds}
              expandedIds={expandedIds}
              loadingIds={loadingIds}
              onToggleChecked={onToggleChecked}
              onToggleExpanded={onToggleExpanded}
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
  const adapter = useViewerAdapter();
  const viewpoints = useViewpoints();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSaveView = useCallback(async () => {
    const state = adapter.getViewpointState?.();
    if (!state) {
      toast.show({ kind: 'error', message: 'Cannot capture view state.' });
      return;
    }
    setSaving(true);
    const now = Date.now();
    const viewpoint: Viewpoint = {
      id: `view-${now}`,
      name: `View ${viewpoints.customViews.length + 1}`,
      cameraPosition: state.camera.position,
      cameraTarget: state.camera.target,
      isOrthographic: state.camera.isOrthographic,
      hiddenObjects: state.hiddenObjects,
      sectioning: state.sectioning,
      markups: [],
      createdAt: now,
    };
    const result = await viewpoints.addCustomView(viewpoint);
    setSaving(false);
    if (result.ok) {
      toast.show({ kind: 'success', message: `"${viewpoint.name}" saved.` });
    } else if (result.reason === 'writer-unavailable') {
      toast.show({ kind: 'error', message: 'Saving views is only available when running locally.' });
    } else {
      toast.show({ kind: 'error', message: 'Failed to save view. Try again.' });
    }
  }, [adapter, viewpoints, toast]);

  return (
    <div className="px-4 py-2 border-b border-[#d6dadc] flex items-center gap-2">
      <PanelSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search viewpoints"
        onFilter={() => {}}
      />
      <button
        type="button"
        onClick={handleSaveView}
        disabled={saving}
        title="Save current view"
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded hover:bg-[#EEF0F1] disabled:opacity-40 transition-colors"
      >
        <Plus size={16} className="text-[#232729]" />
      </button>
    </div>
  );
}

// ─── Drag-and-drop types + helpers ───────────────────────────────────────────

type DragTarget = { id: string; position: 'before' | 'after' | 'inside' };

interface DragProps {
  draggingId: string | null;
  dropTarget: DragTarget | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (id: string, position: 'before' | 'after' | 'inside') => void;
  onDragLeave: (id: string) => void;
  onDrop: (id: string) => void;
}

function reorderItems<T extends { id: string }>(
  items: T[],
  dragId: string,
  targetId: string,
  position: 'before' | 'after',
): T[] {
  const result = [...items];
  const dragIdx = result.findIndex((i) => i.id === dragId);
  if (dragIdx === -1) return result;
  const [dragged] = result.splice(dragIdx, 1);
  const targetIdx = result.findIndex((i) => i.id === targetId);
  if (targetIdx === -1) return [...result, dragged];
  result.splice(position === 'before' ? targetIdx : targetIdx + 1, 0, dragged);
  return result;
}


function ViewRow({
  view,
  checked,
  onCheckedChange,
  selected,
  depth,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onSelect,
  onDoubleClick,
  onContextMenu,
  dragProps,
}: {
  view: ViewData;
  checked?: boolean;
  onCheckedChange?: (id: string, checked: boolean) => void;
  selected: boolean;
  depth: number;
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (val: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onSelect: (id: string) => void;
  onDoubleClick: (id: string, currentName: string) => void;
  onContextMenu: (e: React.MouseEvent, viewId: string) => void;
  dragProps?: DragProps;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  if (isRenaming) {
    return (
      <div
        data-view-row
        className="flex items-center gap-1 bg-blue-50"
        style={{ paddingLeft: 28 + depth * 20, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}
      >
        <input
          ref={inputRef}
          type="text"
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onRenameCommit(); if (e.key === 'Escape') onRenameCancel(); }}
          onBlur={onRenameCommit}
          className="text-sm flex-1 border border-blue-400 rounded px-1.5 py-0.5 outline-none"
        />
      </div>
    );
  }

  return (
    <TreeNode
      id={view.id}
      label={view.name}
      depth={depth}
      type="leaf"
      checked={checked}
      onCheckedChange={onCheckedChange}
      selected={selected}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      draggable={!!dragProps}
      onDragStart={dragProps?.onDragStart}
      onDragEnd={dragProps?.onDragEnd}
      onDragOver={dragProps?.onDragOver}
      onDragLeave={dragProps?.onDragLeave}
      onDrop={dragProps?.onDrop}
      isDragging={dragProps?.draggingId === view.id}
      dropIndicator={
        dragProps?.dropTarget?.id === view.id
          ? (dragProps.dropTarget.position as 'before' | 'after')
          : undefined
      }
      actions={
        <>
          {view.isProjectView && (
            <span className="text-[11px] text-gray-500 border border-gray-300 rounded px-1.5 py-0.5 shrink-0">Project View</span>
          )}
        </>
      }
    />
  );
}

function ViewsContent() {
  const adapter = useViewerAdapter();
  const viewpoints = useViewpoints();
  const toast = useToast();
  const { customViews } = viewpoints;

  const views = useMemo<ViewData[]>(
    () => customViews.map((vp) => ({
      id: vp.id,
      name: vp.name,
      folderId: null,
      cameraPosition: vp.cameraPosition,
      cameraTarget: vp.cameraTarget,
      isOrthographic: vp.isOrthographic,
      markups: vp.markups,
      createdAt: vp.createdAt,
      isProjectView: false,
    })),
    [customViews],
  );

  // Local copy drives visual drag-and-drop order; syncs from context on external changes.
  const [localViews, setLocalViews] = useState<ViewData[]>(views);
  useEffect(() => { setLocalViews(views); }, [views]);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; viewId: string } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DragTarget | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSelectView = useCallback((id: string) => {
    clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      const vp = customViews.find((v) => v.id === id);
      if (!vp) return;
      if (id === selectedItemId) {
        setSelectedItemId(null);
        return;
      }
      setSelectedItemId(id);
      adapter.setViewpointState?.(
        {
          camera: { position: vp.cameraPosition, target: vp.cameraTarget, isOrthographic: vp.isOrthographic },
          hiddenObjects: vp.hiddenObjects,
          sectioning: vp.sectioning,
        },
        { animate: true },
      );
    }, 250);
  }, [adapter, customViews, selectedItemId]);

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
    if (position === 'inside') { setDraggingId(null); setDropTarget(null); return; }

    const reordered = reorderItems(localViews, draggingId, targetId, position);
    setLocalViews(reordered);
    setDraggingId(null);
    setDropTarget(null);

    // Persist reorder — map back to Viewpoint objects in new order.
    const reorderedViewpoints = reordered
      .map((v) => customViews.find((vp) => vp.id === v.id))
      .filter((vp): vp is Viewpoint => vp !== undefined);
    viewpoints.reorderCustomViews(reorderedViewpoints).then((result) => {
      if (!result.ok && result.reason === 'writer-unavailable') {
        toast.show({ kind: 'error', message: 'Reordering is only available when running locally.' });
      }
    });
  }, [draggingId, dropTarget, localViews, customViews, viewpoints, toast]);

  const dragProps: DragProps = { draggingId, dropTarget, onDragStart: handleDragStart, onDragEnd: handleDragEnd, onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop };

  const handleContextMenu = useCallback((e: React.MouseEvent, viewId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, viewId });
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [contextMenu]);

  const handleRename = useCallback(() => {
    if (!contextMenu) return;
    const view = localViews.find((v) => v.id === contextMenu.viewId);
    setRenamingId(contextMenu.viewId);
    setRenameValue(view?.name ?? '');
    setContextMenu(null);
  }, [contextMenu, localViews]);

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

  const handleDelete = useCallback(async () => {
    if (!contextMenu) return;
    const { viewId } = contextMenu;
    setContextMenu(null);
    if (selectedItemId === viewId) setSelectedItemId(null);
    const result = await viewpoints.deleteCustomView(viewId);
    if (!result.ok && result.reason === 'writer-unavailable') {
      toast.show({ kind: 'error', message: 'Deleting is only available when running locally.' });
    }
  }, [contextMenu, selectedItemId, viewpoints, toast]);

  const handleBackgroundClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-view-row]') || target.closest('[data-context-menu]')) return;
    setSelectedItemId(null);
  }, []);

  return (
    <div className="bg-white rounded-md overflow-hidden py-1 relative min-h-full" onClick={handleBackgroundClick}>
      {localViews.length === 0 && (
        <p className="px-3 py-6 text-sm text-gray-400 text-center">
          No saved views yet. Use the + button in the toolbar to save the current view.
        </p>
      )}

      {localViews.map((view) => (
        <ViewRow
          key={view.id}
          view={view}
          selected={view.id === selectedItemId}
          depth={0}
          isRenaming={renamingId === view.id}
          renameValue={renameValue}
          onRenameChange={setRenameValue}
          onRenameCommit={commitRename}
          onRenameCancel={cancelRename}
          onSelect={handleSelectView}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          dragProps={dragProps}
        />
      ))}

      {contextMenu && (
        <div
          ref={contextMenuRef}
          data-context-menu
          className="fixed bg-white rounded-lg shadow-[0_4px_12px_0_rgba(0,0,0,0.2)] py-1 z-[300] min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button type="button" onClick={handleRename} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">
            Rename
          </button>
          <button type="button" onClick={handleDelete} className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sheets ──────────────────────────────────────────────────────────────────

function SheetsToolbar() {
  const [query, setQuery] = useState('');
  return (
    <div className="px-4 py-2 border-b border-[#d6dadc]">
      <PanelSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search sheets"
      />
    </div>
  );
}

function SheetsContent() {
  return (
    <p className="px-3 py-6 text-sm text-gray-400 text-center">
      No sheets loaded.
    </p>
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

export const PANEL_REGISTRY: Record<PanelId, { Content: () => JSX.Element; Toolbar?: () => JSX.Element }> = {
  'views':       { Content: ViewsContent, Toolbar: ViewsToolbar },
  'items':       { Content: ItemsContent },
  'sheets':      { Content: SheetsContent, Toolbar: SheetsToolbar },
  'object-tree': { Content: ObjectTreeContent, Toolbar: ObjectTreeToolbar },
  'properties':  { Content: PropertiesContent, Toolbar: PropertiesToolbar },
  'search-sets': { Content: SearchSetsContent },
  'deviation':   { Content: DeviationContent },
};
