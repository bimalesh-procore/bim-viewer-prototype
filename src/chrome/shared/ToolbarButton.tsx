const ACTIVE_ICON_FILTER =
  'brightness(0) saturate(100%) invert(31%) sepia(98%) saturate(1800%) hue-rotate(209deg) brightness(92%) contrast(90%)';

export interface ToolbarButtonProps {
  src: string;
  label: string;
  /** Override the visible tooltip text without changing the aria-label. */
  tooltipLabel?: string;
  shortcut?: string;
  showTooltip?: boolean;
  isActive?: boolean;
  /**
   * When true the button is non-interactive and renders at reduced opacity.
   * Used for context-sensitive actions (e.g. Flip / Delete plane) that
   * only make sense when something is selected.
   */
  disabled?: boolean;
  /** Renders the flyout-indicator triangle in the bottom-left corner. */
  hasFlyout?: boolean;
  /**
   * Which side the tooltip appears on.
   * 'right' (default) — tooltip floats right; order: label → shortcut.
   * 'left'            — tooltip floats left;  order: shortcut → label.
   */
  tooltipSide?: 'left' | 'right';
  onClick?: () => void;
}

export function ToolbarButton({
  src,
  label,
  tooltipLabel,
  shortcut,
  showTooltip = false,
  isActive = false,
  disabled = false,
  hasFlyout = false,
  tooltipSide = 'right',
  onClick,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={`mv-toolbar-button relative flex items-center justify-center rounded p-1.5 transition-colors ${
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : isActive
            ? 'bg-[#D2E0F9] hover:bg-[#BCD1F5]'
            : 'hover:bg-[#E3E6E8] active:bg-gray-200'
      }`}
    >
      <img
        src={src}
        alt=""
        width={24}
        height={24}
        className="block w-6 h-6"
        style={isActive && !disabled ? { filter: ACTIVE_ICON_FILTER } : undefined}
      />
      {showTooltip && (
        <div
          className={`mv-toolbar-tooltip mv-toolbar-tooltip-${tooltipSide}`}
          aria-hidden="true"
        >
          {tooltipSide === 'left' && shortcut && (
            <span className="mv-toolbar-tooltip-shortcut">{shortcut}</span>
          )}
          <span className="mv-toolbar-tooltip-label">{tooltipLabel ?? label}</span>
          {tooltipSide === 'right' && shortcut && (
            <span className="mv-toolbar-tooltip-shortcut">{shortcut}</span>
          )}
        </div>
      )}
      {hasFlyout && (
        <svg
          aria-hidden="true"
          viewBox="0 0 8 8"
          className="absolute bottom-0.5 left-0.5 h-2 w-2"
        >
          <path d="M0 0L8 8H0V0Z" fill="#8b98a1" />
        </svg>
      )}
    </button>
  );
}
