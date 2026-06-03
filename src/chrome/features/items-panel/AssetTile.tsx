import { ChevronDown, ExternalLink, MessageSquare } from 'lucide-react';
import type { Asset, AssetStatus } from './types';

interface AssetTileProps {
  asset: Asset;
  onClick: (asset: Asset) => void;
}

// Pill style derived from the Panel.svg spec:
//   bg #E4ECFB, border #BCD1F5, text #1D5CC9 — for OPEN/ACTIVE
const STATUS_STYLES: Record<AssetStatus, { label: string; className: string }> = {
  active:      { label: 'ACTIVE',    className: 'bg-[#E4ECFB] border-[#BCD1F5] text-[#1D5CC9]' },
  'in-repair': { label: 'IN REPAIR', className: 'bg-[#FFEFD6] border-[#F0C682] text-[#8A5A00]' },
  inactive:    { label: 'INACTIVE',  className: 'bg-[#EEF0F1] border-[#D6DADC] text-[#5E696E]' },
};

// Tile spec from Panel.svg: white fill, rx=4, NO stroke, drop-shadow filter.
// `shadow-sm` approximates the subtle drop-shadow filter.
export function AssetTile({ asset, onClick }: AssetTileProps) {
  const status = STATUS_STYLES[asset.status];

  return (
    <button
      type="button"
      onClick={() => onClick(asset)}
      className="block w-full rounded bg-white px-3 py-3 text-left shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Top row: status pill + comment count + external-link */}
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${status.className}`}
        >
          {status.label}
          <ChevronDown size={12} strokeWidth={2} />
        </span>
        <div className="flex items-center gap-2 text-[#5E696E]">
          <span className="inline-flex items-center gap-1 text-sm">
            <MessageSquare
              size={14}
              strokeWidth={2}
              className={asset.commentCount === 0 ? 'text-[#D6DADC]' : 'text-[#232729]'}
              fill={asset.commentCount === 0 ? 'none' : 'currentColor'}
            />
            <span className={asset.commentCount === 0 ? 'text-[#D6DADC]' : 'text-[#232729]'}>
              {asset.commentCount}
            </span>
          </span>
          <ExternalLink size={16} strokeWidth={2} className="text-[#5E696E]" />
        </div>
      </div>

      {/* Title */}
      <div className="mb-1 text-base font-semibold leading-snug text-[#232729]">
        {asset.name}
      </div>

      {/* Meta lines */}
      <div className="text-sm text-[#5E696E]">
        {asset.category} · {asset.location}
      </div>
      <div className="text-sm text-[#75838A]">
        Last service {asset.lastServiceDate}
      </div>
    </button>
  );
}
