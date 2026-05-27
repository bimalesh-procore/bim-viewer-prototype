import { Check } from 'lucide-react';
import { useFormFactor, FORM_FACTORS, type FormFactor } from '../form-factor';

const FORM_FACTOR_LABELS: Record<FormFactor, string> = {
  desktop: 'Desktop',
  tablet: 'Tablet',
  phone: 'Phone',
};

interface FormFactorMenuProps {
  onSelect?: () => void;
}

export function FormFactorMenu({ onSelect }: FormFactorMenuProps) {
  const { formFactor, setFormFactor } = useFormFactor();

  return (
    <div
      role="menu"
      className="min-w-[160px] bg-white rounded-md shadow-lg border border-gray-200 py-1"
    >
      <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        Form factor
      </div>
      {FORM_FACTORS.map((ff) => {
        const isActive = ff === formFactor;
        return (
          <button
            key={ff}
            type="button"
            role="menuitemradio"
            aria-checked={isActive}
            onClick={() => {
              setFormFactor(ff);
              onSelect?.();
            }}
            className="flex items-center justify-between w-full gap-3 px-3 py-2 text-sm text-[#232729] hover:bg-gray-100 transition-colors text-left"
          >
            <span className="font-medium">{FORM_FACTOR_LABELS[ff]}</span>
            {isActive && <Check size={16} className="text-[#2066DF] flex-shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}
