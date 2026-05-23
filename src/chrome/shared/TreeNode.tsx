import { ChevronDown, ChevronRight, Folder } from '@procore/core-icons';
import { Check } from 'lucide-react';

export interface TreeNodeProps {
  id: string;
  label: string;
  depth: number;
  type: 'folder' | 'leaf';
  // folder
  expanded?: boolean;
  onToggle?: (id: string) => void;
  indeterminate?: boolean;
  children?: React.ReactNode;
  // shared
  checked?: boolean;
  onCheckedChange?: (id: string, checked: boolean) => void;
  loading?: boolean;
  selected?: boolean;
  onClick?: (id: string) => void;
  // leaf
  onDoubleClick?: (id: string, label: string) => void;
  onContextMenu?: (e: React.MouseEvent, id: string) => void;
  actions?: React.ReactNode;
}

export function TreeNode({
  id,
  label,
  depth,
  type,
  expanded = false,
  onToggle,
  indeterminate = false,
  children,
  checked = false,
  onCheckedChange,
  loading = false,
  selected = false,
  onClick,
  onDoubleClick,
  onContextMenu,
  actions,
}: TreeNodeProps) {
  const isFolder = type === 'folder';
  const paddingLeft = (isFolder ? 16 : 24) + depth * 20;
  const checkboxState = indeterminate ? 'indeterminate' : checked ? 'checked' : 'unchecked';

  return (
    <>
      <div
        className={`flex items-center gap-2 cursor-pointer select-none ${
          selected ? '' : 'hover:bg-gray-50'
        }`}
        style={{ paddingLeft, paddingRight: 12, paddingTop: 8, paddingBottom: 8, backgroundColor: selected ? '#EDF2FC' : undefined }}
        onClick={() => { if (isFolder) onToggle?.(id); onClick?.(id); }}
        onDoubleClick={() => !isFolder && onDoubleClick?.(id, label)}
        onContextMenu={(e) => !isFolder && onContextMenu?.(e, id)}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={checkboxState === 'indeterminate' ? 'mixed' : checkboxState === 'checked'}
          disabled={loading}
          onClick={(e) => { e.stopPropagation(); onCheckedChange?.(id, !checked); }}
          className={`shrink-0 size-5 rounded-[2px] flex items-center justify-center transition-colors ${
            checkboxState === 'unchecked' ? 'bg-white border-2 border-[#6A767C]' : 'bg-[#2066DF]'
          } ${loading ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {checkboxState === 'checked' && <Check size={10} strokeWidth={3} className="text-white" />}
          {checkboxState === 'indeterminate' && <span className="block w-[6px] h-[1.5px] bg-white" />}
        </button>

        {isFolder && (
          <button type="button" className="w-6 h-6 flex items-center justify-center shrink-0" style={{ color: '#232729' }}>
            {expanded ? <ChevronDown /> : <ChevronRight />}
          </button>
        )}

        {isFolder && <Folder className="shrink-0" style={{ color: '#6A767C' }} />}

        {loading ? (
          <span className="flex-1 ml-1 h-3.5 rounded bg-gray-200 mv-skeleton-pulse" style={{ maxWidth: 120 }} />
        ) : (
          <span className={`text-sm truncate flex-1 ml-1 ${selected ? 'font-semibold' : ''}`} style={{ color: selected ? '#1D5CC9' : '#374151' }}>
            {label}
          </span>
        )}

        {!loading && !isFolder && actions}
      </div>

      {isFolder && expanded && children}
    </>
  );
}
