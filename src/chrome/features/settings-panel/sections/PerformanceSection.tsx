import { ChevronDown, X } from 'lucide-react';

export function PerformanceSection() {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-[#232729]">Performance</label>
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Not yet implemented"
        className="flex items-center justify-between w-full px-3 py-2 text-sm text-[#232729] bg-white border border-gray-300 rounded cursor-not-allowed opacity-80"
      >
        <span>High</span>
        <span className="flex items-center gap-1.5 text-gray-500">
          <X size={14} />
          <ChevronDown size={16} />
        </span>
      </button>
    </div>
  );
}
