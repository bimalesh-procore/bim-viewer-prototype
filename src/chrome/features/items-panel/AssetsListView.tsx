import { useEffect, useState } from 'react';
import { ArrowDownNarrowWide, Filter, Search } from 'lucide-react';
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
      {/* Search + filter row */}
      <div className="flex items-center gap-2 px-3 py-3 bg-white">
        <div className="relative flex-1">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full rounded-md bg-[#EEF0F1] px-3 py-2 pr-9 text-sm text-[#232729] placeholder:text-[#75838A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#BCD1F5]"
          />
          <Search
            size={16}
            strokeWidth={2}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#5E696E]"
          />
        </div>
        <button
          type="button"
          className="inline-flex items-center rounded-md px-2 py-2 text-[#5E696E] hover:bg-[#EEF0F1]"
          aria-label="Filter assets"
        >
          <Filter size={16} strokeWidth={2} />
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
