import defaultIcon from '../../assets/icons/bottom-toolbar/default.svg';
import realismIcon from '../../assets/icons/bottom-toolbar/realism.svg';

export type RenderStyle = 'default' | 'realism';

interface RenderStyleOption {
  id: RenderStyle;
  label: string;
  icon: string;
}

const OPTIONS: RenderStyleOption[] = [
  { id: 'default', label: 'Default', icon: defaultIcon },
  { id: 'realism', label: 'Realism', icon: realismIcon },
];

export function RENDER_STYLE_OPTIONS(): RenderStyleOption[] {
  return OPTIONS;
}

interface RenderStyleMenuProps {
  activeStyle: RenderStyle;
  onSelect: (style: RenderStyle) => void;
}

export function RenderStyleMenu({ activeStyle, onSelect }: RenderStyleMenuProps) {
  return (
    <div
      className="absolute bottom-full right-0 mb-2 bg-white rounded-lg shadow-[0_4px_12px_0_rgba(0,0,0,0.2)] p-1 flex flex-col gap-1 z-[230] w-max"
      role="menu"
    >
      {OPTIONS.map((option) => {
        const isActive = option.id === activeStyle;
        return (
          <button
            key={option.id}
            type="button"
            role="menuitem"
            onClick={() => onSelect(option.id)}
            className={`flex items-center gap-2 px-2 py-1.5 rounded transition-colors ${
              isActive ? 'bg-[#D2E0F9] hover:bg-[#BCD1F5]' : 'hover:bg-[#E3E6E8]'
            }`}
          >
            <img src={option.icon} alt="" width={20} height={20} aria-hidden="true" />
            <span className="text-[14px] leading-[20px] tracking-[0.15px] text-[#232729]">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
