import { useEffect, useRef, useState } from 'react';

const ACTIVE_ICON_FILTER =
  'brightness(0) saturate(100%) invert(31%) sepia(98%) saturate(1800%) hue-rotate(209deg) brightness(92%) contrast(90%)';

// Per-button hover delay before tooltip appears.
const TOOLTIP_HOVER_DELAY_MS = 1000;

export interface ToolbarButtonProps {
  src: string;
  label: string;
  /** Override the visible tooltip text without changing the aria-label. */
  tooltipLabel?: string;
  shortcut?: string;
  /**
   * Tooltip visibility is self-managed per button (1s hover delay).
   * Setting this to false hard-suppresses the tooltip (e.g. while dragging
   * or when a panel is open and tooltips would obscure content).
   */
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
   * 'top'             — tooltip floats above; order: label → shortcut.
   */
  tooltipSide?: 'left' | 'right' | 'top';
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function ToolbarButton({
  src,
  label,
  tooltipLabel,
  shortcut,
  showTooltip = true,
  isActive = false,
  disabled = false,
  hasFlyout = false,
  tooltipSide = 'right',
  onClick,
  onMouseEnter,
  onMouseLeave,
}: ToolbarButtonProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  const cancelTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Clean up any pending timer on unmount.
  useEffect(() => () => cancelTimer(), []);

  // If the consumer hard-disables tooltips mid-hover (e.g. drag starts),
  // cancel any pending appearance and hide immediately.
  useEffect(() => {
    if (!showTooltip) {
      cancelTimer();
      setTooltipVisible(false);
    }
  }, [showTooltip]);

  const handleMouseEnter = () => {
    onMouseEnter?.();
    if (!showTooltip || disabled) return;
    cancelTimer();
    timerRef.current = window.setTimeout(() => {
      setTooltipVisible(true);
      timerRef.current = null;
    }, TOOLTIP_HOVER_DELAY_MS);
  };

  const handleMouseLeave = () => {
    onMouseLeave?.();
    cancelTimer();
    setTooltipVisible(false);
  };

  const handleClick = () => {
    // Hide tooltip immediately on click — the click is the user's
    // signal of intent; the tooltip is no longer informative.
    cancelTimer();
    setTooltipVisible(false);
    onClick?.();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      disabled={disabled}
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={`mv-toolbar-button relative flex items-center justify-center rounded p-1.5 transition-colors ${
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : isActive
            ? (tooltipVisible ? 'bg-[#BCD1F5]' : 'bg-[#D2E0F9]')
            : (tooltipVisible ? 'bg-[#D2E0F9]' : 'active:bg-gray-200')
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
      {tooltipVisible && (
        <div
          className={`mv-toolbar-tooltip mv-toolbar-tooltip-${tooltipSide}`}
          aria-hidden="true"
        >
          {tooltipSide === 'left' && shortcut && (
            <span className="mv-toolbar-tooltip-shortcut">{shortcut}</span>
          )}
          <span className="mv-toolbar-tooltip-label">{tooltipLabel ?? label}</span>
          {(tooltipSide === 'right' || tooltipSide === 'top') && shortcut && (
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
