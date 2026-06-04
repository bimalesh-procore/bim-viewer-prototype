import type { Asset, AssetStatus } from './types';
import { ItemCard } from './ItemCard';
import type { ItemCardStatus } from './ItemCard';

interface AssetTileProps {
  asset: Asset;
  onClick: (asset: Asset) => void;
}

// Status pill styles — kept here because they're Asset-domain knowledge.
const STATUS_STYLES: Record<AssetStatus, ItemCardStatus> = {
  active:      { label: 'ACTIVE',    className: 'bg-[#E4ECFB] border-[#BCD1F5] text-[#1D5CC9]' },
  'in-repair': { label: 'IN REPAIR', className: 'bg-[#FFEFD6] border-[#F0C682] text-[#8A5A00]' },
  inactive:    { label: 'INACTIVE',  className: 'bg-[#EEF0F1] border-[#D6DADC] text-[#5E696E]' },
};

export function AssetTile({ asset, onClick }: AssetTileProps) {
  return (
    <ItemCard
      title={asset.name}
      status={STATUS_STYLES[asset.status]}
      commentCount={asset.commentCount}
      showExternalLink
      meta={`${asset.category} · ${asset.location}`}
      secondaryMeta={`Last service ${asset.lastServiceDate}`}
      onClick={() => onClick(asset)}
    />
  );
}
