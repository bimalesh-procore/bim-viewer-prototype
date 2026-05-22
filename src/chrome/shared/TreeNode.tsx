import { ChevronDown, ChevronRight, Folder, Check } from 'lucide-react';

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
  // leaf
  selected?: boolean;
  onClick?: (id: string) => void;
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
  const paddingLeft = 8 + depth * 20;
  const checkboxState = indeterminate ? 'indeterminate' : checked ? 'checked' : 'unchecked';

  return (
    <>
      <div
        className={`flex items-center gap-1 cursor-pointer select-none ${
          !isFolder && selected ? 'bg-blue-50' : 'hover:bg-gray-50'
        }`}
        style={{ paddingLeft, paddingRight: 8, paddingTop: 6, paddingBottom: 6 }}
        onClick={() => (isFolder ? onToggle?.(id) : onClick?.(id))}
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
          <button type="button" className="w-5 h-5 flex items-center justify-center shrink-0 text-gray-500">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}

        {isFolder && <Folder size={16} className="text-gray-400 shrink-0" />}

        {loading ? (
          <span className="flex-1 ml-1 h-3.5 rounded bg-gray-200 mv-skeleton-pulse" style={{ maxWidth: 120 }} />
        ) : (
          <span className={`text-sm truncate flex-1 ml-1 ${!isFolder && selected ? 'text-blue-700' : 'text-gray-700'}`}>
            {label}
          </span>
        )}

        {!loading && !isFolder && actions}
      </div>

      {isFolder && expanded && children}
    </>
  );
}
