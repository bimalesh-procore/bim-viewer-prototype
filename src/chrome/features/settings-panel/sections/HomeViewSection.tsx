import { Home } from 'lucide-react';

interface HomeViewSectionProps {
  onUpdate: () => void;
  disabled?: boolean;
}

export function HomeViewSection({ onUpdate, disabled = false }: HomeViewSectionProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-[#232729]">Home View</label>
      <p className="text-xs text-gray-500 leading-snug">
        Set current view as project home for all users.
      </p>
      <button
        type="button"
        onClick={onUpdate}
        disabled={disabled}
        className="self-start flex items-center gap-2 px-3 py-1.5 mt-1 text-sm font-medium text-[#232729] bg-[#f0f1f2] border border-gray-300 rounded hover:bg-gray-200 active:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Home size={16} />
        <span>Update Home View</span>
      </button>
    </div>
  );
}
