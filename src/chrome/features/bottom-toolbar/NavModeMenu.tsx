import cursorIcon from '../../assets/icons/navigation-wheel/cursor-icon.svg';
import orbitIcon from '../../assets/icons/navigation-wheel/orbit-icon.svg';
import flyIcon from '../../assets/icons/navigation-wheel/fly-icon.svg';

export type NavMode = 'select' | 'orbit' | 'fly';

interface NavModeMenuProps {
  activeMode: NavMode;
  onSelect: (mode: NavMode) => void;
}

const MODES: { id: NavMode; label: string; icon: string }[] = [
  { id: 'select', label: 'Default', icon: cursorIcon },
  { id: 'orbit', label: 'Orbit', icon: orbitIcon },
  { id: 'fly', label: 'Fly', icon: flyIcon },
];

export function NAV_MODE_ICONS(): Record<NavMode, string> {
  return { select: cursorIcon, orbit: orbitIcon, fly: flyIcon };
}

export function NavModeMenu({ activeMode, onSelect }: NavModeMenuProps) {
  return (
    <div
      className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 bg-white rounded-lg shadow-[0_4px_12px_0_rgba(0,0,0,0.2)] p-1 flex flex-col gap-1 z-[230] w-max"
      role="menu"
    >
      {MODES.map((mode) => {
        const isActive = mode.id === activeMode;
        return (
          <button
            key={mode.id}
            type="button"
            role="menuitem"
            onClick={() => onSelect(mode.id)}
            className={`flex items-center gap-2 px-2 py-1.5 rounded transition-colors ${
              isActive ? 'bg-[#D2E0F9] hover:bg-[#BCD1F5]' : 'hover:bg-[#E3E6E8]'
            }`}
          >
            <img src={mode.icon} alt="" width={20} height={20} aria-hidden="true" />
            <span className="text-[14px] leading-[20px] tracking-[0.15px] text-[#232729]">
              {mode.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
