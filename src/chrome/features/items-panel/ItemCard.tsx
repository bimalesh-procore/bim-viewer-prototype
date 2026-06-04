import { ChevronDown, ExternalLink, MessageSquare } from 'lucide-react';

export interface ItemCardStatus {
  label: string;
  /** Full Tailwind bg/border/text token string, e.g. 'bg-[#E4ECFB] border-[#BCD1F5] text-[#1D5CC9]' */
  className: string;
}

export interface ItemCardProps {
  title: string;
  /** Status pill shown in the top-left corner. Omit to hide the pill entirely. */
  status?: ItemCardStatus;
  /** Comment count. Zero renders the icon dimmed. Omit to hide entirely. */
  commentCount?: number;
  /** Show the external-link icon in the top-right corner. */
  showExternalLink?: boolean;
  /** First meta line below the title (e.g. "HVAC · Level 2"). */
  meta?: string;
  /** Second meta line below the title (e.g. "Last service Jan 5"). */
  secondaryMeta?: string;
  onClick: () => void;
}

/**
 * Generic card used across all Items-panel tools (Assets, Punch List, RFIs, etc.).
 * Data is passed as plain props so each tool can map its own shape without
 * depending on the Asset type.
 */
export function ItemCard({
  title,
  status,
  commentCount,
  showExternalLink,
  meta,
  secondaryMeta,
  onClick,
}: ItemCardProps) {
  const showTopRow = status !== undefined || commentCount !== undefined || showExternalLink;

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded bg-white px-3 py-3 text-left shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Top row: status pill + comment count + external-link */}
      {showTopRow && (
        <div className="mb-2 flex items-center justify-between">
          {status ? (
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${status.className}`}
            >
              {status.label}
              <ChevronDown size={12} strokeWidth={2} />
            </span>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2 text-[#5E696E]">
            {commentCount !== undefined && (
              <span className="inline-flex items-center gap-1 text-sm">
                <MessageSquare
                  size={14}
                  strokeWidth={2}
                  className={commentCount === 0 ? 'text-[#D6DADC]' : 'text-[#232729]'}
                  fill={commentCount === 0 ? 'none' : 'currentColor'}
                />
                <span className={commentCount === 0 ? 'text-[#D6DADC]' : 'text-[#232729]'}>
                  {commentCount}
                </span>
              </span>
            )}
            {showExternalLink && (
              <ExternalLink size={16} strokeWidth={2} className="text-[#5E696E]" />
            )}
          </div>
        </div>
      )}

      {/* Title */}
      <div className="mb-1 text-base font-semibold leading-snug text-[#232729]">
        {title}
      </div>

      {/* Meta lines */}
      {meta && (
        <div className="text-sm text-[#5E696E]">{meta}</div>
      )}
      {secondaryMeta && (
        <div className="text-sm text-[#75838A]">{secondaryMeta}</div>
      )}
    </button>
  );
}
