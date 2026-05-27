import { ChevronDown } from 'lucide-react';

export function MeasurementSystemSection() {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-[#232729]">Measurement System</label>
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Not yet implemented"
        className="flex items-center justify-between w-full px-3 py-2 text-sm text-[#232729] bg-white border border-gray-300 rounded cursor-not-allowed opacity-80"
      >
        <span>Metric (Meters)</span>
        <ChevronDown size={16} className="text-gray-500" />
      </button>
    </div>
  );
}
