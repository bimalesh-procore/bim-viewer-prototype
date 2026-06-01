import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, Check, Folder } from 'lucide-react';

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
  /** Show the checkbox. Default true. Pass false for list-style panels (e.g. Viewpoints). */
  showCheckbox?: boolean;
  checked?: boolean;
  onCheckedChange?: (id: string, checked: boolean) => void;
  loading?: boolean;
  selected?: boolean;
  onClick?: (id: string) => void;
  // leaf
  onDoubleClick?: (id: string, label: string) => void;
  onContextMenu?: (e: React.MouseEvent, id: string) => void;
  /** Trailing action slot. */
  actions?: React.ReactNode;
  /** When true, actions are hidden until the row is hovered or selected. Default false. */
  showActionsOnHover?: boolean;
  /** Custom hover background color. When omitted, falls back to a subtle gray. */
  hoverBg?: string;
  /** Optional subtitle rendered below the label (switches row to top-align). */
  subtitle?: string;
  /** Hide the folder icon (folder rows only). Default false. */
  hideFolderIcon?: boolean;
  /** Render the label at base size and bold, regardless of selection state. */
  labelBold?: boolean;
  // inline rename — all three props required together to enable rename mode
  isRenaming?: boolean;
  renameValue?: string;
  onRenameChange?: (val: string) => void;
  onRenameCommit?: () => void;
  onRenameCancel?: () => void;
  // drag and drop (optional — omit all to disable D&D on this node)
  draggable?: boolean;
  onDragStart?: (id: string) => void;
  onDragEnd?: (id: string) => void;
  onDragOver?: (id: string, position: 'before' | 'after' | 'inside') => void;
  onDragLeave?: (id: string) => void;
  onDrop?: (id: string) => void;
  dropIndicator?: 'before' | 'after';
  isDropTarget?: boolean;
  isDragging?: boolean;
  /** When true, indicates unsaved changes — darker gray bg, bold black text. */
  isDirty?: boolean;
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
  showCheckbox = true,
  checked = false,
  onCheckedChange,
  loading = false,
  selected = false,
  onClick,
  onDoubleClick,
  onContextMenu,
  actions,
  showActionsOnHover = false,
  hoverBg,
  subtitle,
  hideFolderIcon = false,
  labelBold = false,
  isRenaming = false,
  renameValue = '',
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  dropIndicator,
  isDropTarget = false,
  isDragging = false,
  isDirty = false,
}: TreeNodeProps) {
  const isFolder = type === 'folder';
  const paddingLeft = 16 + depth * 20 + (!isFolder && depth > 0 ? 8 : 0);
  const checkboxState = indeterminate ? 'indeterminate' : checked ? 'checked' : 'unchecked';
  const [hovered, setHovered] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  // Rename mode — renders in place of the normal row, same height (40px) to prevent layout shift.
  if (isRenaming) {
    return (
      <div
        data-tree-node
        className="flex items-center bg-[#EDF2FC]"
        style={{ paddingLeft, paddingRight: 8, height: 40 }}
      >
        <input
          ref={renameInputRef}
          type="text"
          value={renameValue}
          onChange={(e) => onRenameChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameCommit?.();
            if (e.key === 'Escape') onRenameCancel?.();
          }}
          onBlur={onRenameCommit}
          className="text-sm flex-1 min-w-0 border border-blue-400 rounded px-1.5 py-0 outline-none bg-white"
        />
      </div>
    );
  }

  const actionsVisible = !showActionsOnHover || hovered || selected || isDirty;

  return (
    <>
      <div
        className="relative"
        data-tree-node
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {dropIndicator === 'before' && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#2066DF] z-10 pointer-events-none" />
        )}
        <div
          className={`flex ${subtitle ? 'items-start' : 'items-center'} gap-2 cursor-pointer select-none transition-colors ${isDragging ? 'opacity-40' : ''}`}
          style={{
            paddingLeft, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
            backgroundColor: selected || isDropTarget
              ? '#EDF2FC'
              : isDirty
                ? hovered ? '#DCDDE0' : '#E8E9EB'
                : hovered
                  ? (hoverBg ?? 'rgba(0,0,0,0.03)')
                  : undefined,
          }}
          draggable={draggable}
          onClick={() => onClick?.(id)}
          onDoubleClick={() => !isFolder && onDoubleClick?.(id, label)}
          onContextMenu={(e) => !isFolder && onContextMenu?.(e, id)}
          onDragStart={onDragStart ? (e) => { e.stopPropagation(); onDragStart(id); } : undefined}
          onDragEnd={onDragEnd ? () => onDragEnd(id) : undefined}
          onDragOver={onDragOver ? (e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientY - rect.top) / rect.height;
            let pos: 'before' | 'after' | 'inside';
            if (isFolder) {
              if (ratio < 0.33) pos = 'before';
              else if (ratio > 0.67) pos = 'after';
              else pos = 'inside';
            } else {
              pos = ratio < 0.5 ? 'before' : 'after';
            }
            onDragOver(id, pos);
          } : undefined}
          onDragLeave={onDragLeave ? (e) => { e.stopPropagation(); onDragLeave(id); } : undefined}
          onDrop={onDrop ? (e) => { e.preventDefault(); e.stopPropagation(); onDrop(id); } : undefined}
        >
          {showCheckbox && (
            <button
              type="button"
              role="checkbox"
              aria-checked={checkboxState === 'indeterminate' ? 'mixed' : checkboxState === 'checked'}
              disabled={loading}
              onClick={(e) => { e.stopPropagation(); onCheckedChange?.(id, !checked); }}
              className={`shrink-0 size-5 rounded-[2px] flex items-center justify-center transition-colors ${subtitle ? 'mt-0.5' : ''} ${
                checkboxState === 'unchecked' ? 'bg-white border-2 border-[#6A767C]' : 'bg-[#2066DF]'
              } ${loading ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {checkboxState === 'checked' && <Check size={10} strokeWidth={3} className="text-white" />}
              {checkboxState === 'indeterminate' && <span className="block w-[6px] h-[1.5px] bg-white" />}
            </button>
          )}

          {isFolder && (
            <button
              type="button"
              className="w-6 h-6 flex items-center justify-center shrink-0"
              style={{ color: '#232729' }}
              onClick={(e) => { e.stopPropagation(); onToggle?.(id); }}
            >
              {expanded ? <ChevronDown /> : <ChevronRight />}
            </button>
          )}

          {isFolder && !hideFolderIcon && <Folder className="shrink-0" style={{ color: '#6A767C' }} />}

          {loading ? (
            <span className="flex-1 ml-1 h-3.5 rounded bg-gray-200 mv-skeleton-pulse" style={{ maxWidth: 120 }} />
          ) : subtitle ? (
            <div className="flex-1 min-w-0 ml-1">
              <p className={`text-sm truncate ${selected || labelBold || isDirty ? 'font-semibold' : ''}`} style={{ color: selected ? '#1D5CC9' : isDirty ? '#111827' : '#374151' }}>
                {label}
              </p>
              <p className="text-xs truncate" style={{ color: '#6A767C' }}>{subtitle}</p>
            </div>
          ) : (
            <span className={`truncate flex-1 ml-1 ${labelBold ? 'text-base' : 'text-sm'} ${selected || labelBold || isDirty ? 'font-semibold' : ''}`} style={{ color: selected ? '#1D5CC9' : isDirty ? '#111827' : '#374151' }}>
              {label}
            </span>
          )}

          {!loading && !isFolder && actions && (
            <div className={`flex items-center gap-0.5 shrink-0 ${actionsVisible ? '' : 'invisible'}`}>
              {actions}
            </div>
          )}
        </div>
        {dropIndicator === 'after' && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2066DF] z-10 pointer-events-none" />
        )}
      </div>

      {isFolder && expanded && children}
    </>
  );
}
