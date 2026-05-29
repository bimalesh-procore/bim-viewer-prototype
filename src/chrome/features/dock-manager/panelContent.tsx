import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { DropdownMenu, DropdownMenuItem } from '../../shared/DropdownMenu';
import {
  AlertTriangle,
  Binoculars,
  ClipboardList,
  FileQuestion,
  Home,
  ListChecks,
  MoreVertical,
  ShieldCheck,
  Wrench,
  ChevronRight,
  ChevronDown,
  Check,
  Star,
} from 'lucide-react';
import editIcon from '../../assets/icons/views/edit.svg';
import shareIcon from '../../assets/icons/views/share.svg';
import moreIcon from '../../assets/icons/views/more.svg';
import { useViewerAdapter } from '../viewer-adapter/ViewerAdapterContext';
import type { SearchSet, ViewData, PropertyGroup, ObjectProperty } from '../viewer-adapter/types';
import { TreeNode } from '../../shared/TreeNode';
import type { PanelId } from './useDockStore';
import { useViewpoints } from '../viewpoints';
import type { Viewpoint, ViewpointFolder } from '../viewpoints';
import { useToast } from '../toast/ToastContext';
import searchFieldIcon from '../../assets/icons/panel/searchField.svg';
import filterButtonIcon from '../../assets/icons/panel/filterButton.svg';
import hideIcon from '../../assets/icons/panel/hide.svg';
import showIcon from '../../assets/icons/panel/show.svg';
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
        <div className="py-1">
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

function ViewsContent() {
  const adapter = useViewerAdapter();
  const viewpoints = useViewpoints();
  const toast = useToast();
  const { customViews, folders } = viewpoints;

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

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
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

  const handleFolderChecked = useCallback((folderId: string, checked: boolean) => {
    const childIds = localViews.filter((v) => v.folderId === folderId).map((v) => v.id);
    setCheckedIds((prev) => {
      const next = new Set(prev);
      childIds.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  }, [localViews]);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Cooldown prevents camera-change during the restore animation from deselecting the row.
  const restoringUntilRef = useRef<number>(0);

  // ── Camera change → deselect after navigate away ───────────────────────────
  useEffect(() => {
    const unsub = adapter.subscribeCameraChange?.(() => {
      if (Date.now() < restoringUntilRef.current) return;
      setSelectedItemId(null);
    });
    return () => { unsub?.(); };
  }, [adapter]);

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
    };
    const result = await viewpoints.addCustomView(viewpoint);
    if (result.ok) {
      toast.show({ kind: 'success', message: `"${viewpoint.name}" saved.` });
    } else if (result.reason === 'writer-unavailable') {
      toast.show({ kind: 'error', message: 'Saving views is only available when running locally.' });
    } else {
      toast.show({ kind: 'error', message: 'Failed to save view. Try again.' });
    }
  }, [adapter, customViews, viewpoints, toast]);

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
      if (id === selectedItemId) {
        setSelectedItemId(null);
        return;
      }
      setSelectedItemId(id);
      restoringUntilRef.current = Date.now() + 700;
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

    // ── Folder being dragged ───────────────────────────────────────────────
    const draggingFolder = localFolders.find((f) => f.id === draggingId);
    if (draggingFolder) {
      if (position === 'inside') { setDraggingId(null); setDropTarget(null); return; }
      const without = localFolders.filter((f) => f.id !== draggingId);
      const targetIdx = without.findIndex((f) => f.id === targetId);
      if (targetIdx !== -1) {
        without.splice(position === 'before' ? targetIdx : targetIdx + 1, 0, draggingFolder);
      } else {
        without.push(draggingFolder);
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
      // Drop before/after: reorder AND inherit the target's folderId so
      // dragging between folders implicitly re-assigns the view.
      const targetView = localViews.find((v) => v.id === targetId);
      const targetIsFolder = localFolders.some((f) => f.id === targetId);
      const newFolderId = targetView?.folderId ?? (targetIsFolder ? targetId : null);

      const draggingView = localViews.find((v) => v.id === draggingId);
      if (!draggingView) { setDraggingId(null); setDropTarget(null); return; }

      const without = localViews.filter((v) => v.id !== draggingId);
      const moved = { ...draggingView, folderId: newFolderId };
      const targetIdx = without.findIndex((v) => v.id === targetId);
      if (targetIdx !== -1) {
        without.splice(position === 'before' ? targetIdx : targetIdx + 1, 0, moved);
      } else {
        without.push(moved);
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
    const vp = customViews.find((v) => v.id === viewId);
    if (!vp) { setMoreMenu(null); return; }
    const state = adapter.getViewpointState?.();
    if (!state) {
      toast.show({ kind: 'error', message: 'Cannot capture view state.' });
      setMoreMenu(null);
      return;
    }
    setMoreMenu(null);
    const updated: Viewpoint = {
      ...vp,
      cameraPosition: state.camera.position,
      cameraTarget: state.camera.target,
      isOrthographic: state.camera.isOrthographic,
      hiddenObjects: state.hiddenObjects,
      sectioning: state.sectioning,
    };
    const result = await viewpoints.updateCustomView(vp.id, updated);
    if (result.ok) {
      toast.show({ kind: 'success', message: `"${vp.name}" updated.` });
    } else if (result.reason === 'writer-unavailable') {
      toast.show({ kind: 'error', message: 'Updating is only available when running locally.' });
    } else {
      toast.show({ kind: 'error', message: 'Failed to update view. Try again.' });
    }
  }, [moreMenu, customViews, adapter, viewpoints, toast]);

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
    if (selectedItemId === viewId) setSelectedItemId(null);
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

        {/* Folder rows with their children */}
        {localFolders.map((folder) => {
          const folderViews = localViews.filter((v) => v.folderId === folder.id);
          const checkedCount = folderViews.filter((v) => checkedIds.has(v.id)).length;
          const allChecked = folderViews.length > 0 && checkedCount === folderViews.length;
          const indeterminate = checkedCount > 0 && !allChecked;
          return (
            <TreeNode
              key={folder.id}
              id={folder.id}
              label={folder.name}
              depth={0}
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
              {folderViews.map((view) => (
                <TreeNode
                  key={view.id}
                  id={view.id}
                  label={view.name}
                  depth={1}
                  type="leaf"
                  checked={checkedIds.has(view.id)}
                  onCheckedChange={handleViewChecked}
                  selected={view.id === selectedItemId}
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
                      <button type="button" title="Edit name" onClick={(e) => { e.stopPropagation(); handleDoubleClick(view.id, view.name); }} className="w-6 h-6 flex items-center justify-center rounded bg-[#E3E6E8] hover:bg-[#CDD1D4]">
                        <img src={editIcon} alt="" width={14} height={14} />
                      </button>
                      <button type="button" title="Share" onClick={(e) => e.stopPropagation()} className="w-6 h-6 flex items-center justify-center rounded bg-[#E3E6E8] hover:bg-[#CDD1D4]">
                        <img src={shareIcon} alt="" width={14} height={14} />
                      </button>
                      <button type="button" title="More" onClick={(e) => { e.stopPropagation(); handleMoreClick(e, view.id); }} className="w-6 h-6 flex items-center justify-center rounded bg-[#E3E6E8] hover:bg-[#CDD1D4]">
                        <img src={moreIcon} alt="" width={14} height={14} />
                      </button>
                    </>
                  }
                />
              ))}
            </TreeNode>
          );
        })}

        {/* Unfiled views (no folderId) */}
        {localViews.filter((v) => !v.folderId).map((view) => (
          <TreeNode
            key={view.id}
            id={view.id}
            label={view.name}
            depth={0}
            type="leaf"
            checked={checkedIds.has(view.id)}
            onCheckedChange={handleViewChecked}
            selected={view.id === selectedItemId}
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
                <button type="button" title="Edit name" onClick={(e) => { e.stopPropagation(); handleDoubleClick(view.id, view.name); }} className="w-6 h-6 flex items-center justify-center rounded bg-[#E3E6E8] hover:bg-[#CDD1D4]">
                  <img src={editIcon} alt="" width={14} height={14} />
                </button>
                <button type="button" title="Share" onClick={(e) => e.stopPropagation()} className="w-6 h-6 flex items-center justify-center rounded bg-[#E3E6E8] hover:bg-[#CDD1D4]">
                  <img src={shareIcon} alt="" width={14} height={14} />
                </button>
                <button type="button" title="More" onClick={(e) => { e.stopPropagation(); handleMoreClick(e, view.id); }} className="w-6 h-6 flex items-center justify-center rounded bg-[#E3E6E8] hover:bg-[#CDD1D4]">
                  <img src={moreIcon} alt="" width={14} height={14} />
                </button>
              </>
            }
          />
        ))}
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
      <div className="px-4 py-2 border-b border-[#d6dadc]">
        <PanelSearchBar value={query} onChange={setQuery} placeholder="Search sheets" />
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto">
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

export const PANEL_REGISTRY: Record<PanelId, { Content: () => JSX.Element; Toolbar?: () => JSX.Element }> = {
  'views':       { Content: ViewsContent, Toolbar: ViewsToolbar },
  'items':       { Content: ItemsContent },
  'sheets':      { Content: SheetsContent, Toolbar: SheetsToolbar },
  'object-tree': { Content: ObjectTreeContent, Toolbar: ObjectTreeToolbar },
  'properties':  { Content: PropertiesContent, Toolbar: PropertiesToolbar },
  'search-sets': { Content: SearchSetsContent },
  'deviation':   { Content: DeviationContent },
};
