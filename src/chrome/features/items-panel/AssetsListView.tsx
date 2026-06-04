import { useEffect, useState } from 'react';
import { ArrowDownNarrowWide } from 'lucide-react';
import searchFieldIcon from '../../assets/icons/panel/searchField.svg';
import filterButtonIcon from '../../assets/icons/panel/filterButton.svg';
import { AssetTile } from './AssetTile';
import { getAssets } from './assetsData';
import type { Asset } from './types';

interface AssetsListViewProps {
  onAssetClick: (asset: Asset) => void;
}

export function AssetsListView({ onAssetClick }: AssetsListViewProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    getAssets().then((data) => {
      if (alive) setAssets(data);
    });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = query.trim()
    ? assets.filter((a) =>
        [a.name, a.category, a.location]
          .join(' ')
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      )
    : assets;

  return (
    <div className="flex flex-col bg-[#F4F5F6]">
      {/* Search + filter row — matches PanelSearchBar styling used by all other panels */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white">
        <div className="flex items-center flex-1 h-7 rounded bg-[#EEF0F1] pl-3 pr-2 gap-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="flex-1 min-w-0 bg-transparent text-sm text-[#111827] placeholder-[#6B7785] outline-none"
          />
          <img src={searchFieldIcon} alt="" width={24} height={24} className="shrink-0" />
        </div>
        <button
          type="button"
          aria-label="Filter assets"
          className="w-6 h-6 flex items-center justify-center rounded shrink-0 hover:bg-black/5"
        >
          <img src={filterButtonIcon} alt="" width={16} height={16} />
        </button>
      </div>

      {/* Count + sort row */}
      <div className="flex items-center justify-between border-t border-[#D6DADC] bg-[#F4F5F6] px-3 py-1.5 text-sm text-[#5E696E]">
        <span>
          {filtered.length} {filtered.length === 1 ? 'Item' : 'Items'}
        </span>
        {/* Visual-only sort indicator — wire up once sort options are directed */}
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[#5E696E] hover:text-[#232729]"
          aria-label="Sort assets"
        >
          <ArrowDownNarrowWide size={14} strokeWidth={2} />
          <span className="text-sm">Status</span>
        </button>
      </div>

      {/* Tile list */}
      <ul className="flex flex-col gap-2 px-3 py-3">
        {filtered.map((asset) => (
          <li key={asset.id}>
            <AssetTile asset={asset} onClick={onAssetClick} />
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="py-6 text-center text-sm text-[#5E696E]">
            No assets match "{query}"
          </li>
        )}
      </ul>
    </div>
  );
}
