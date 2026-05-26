import { useViewerSettings } from '../viewer-settings/ViewerSettingsContext';
import type { RenderToggleKey } from '../viewer-settings/types';

const ITEMS: { key: RenderToggleKey; label: string }[] = [
  { key: 'mesh', label: 'Mesh' },
  { key: 'lines', label: 'Lines' },
  { key: 'terrain', label: 'Terrain' },
  { key: 'pointCloud', label: 'Point Cloud' },
];

export function RenderSettingsFlyout() {
  const { renderToggles, setRenderToggle } = useViewerSettings();

  return (
    <div
      className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 bg-white rounded-[8px] flex flex-col p-[8px] z-[230]"
      style={{ width: '200px', boxShadow: '0px 4px 12px 0px rgba(0,0,0,0.2)', gap: '4px' }}
    >
      {ITEMS.map(({ key, label }) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '36px' }}>
          <div
            role="switch"
            aria-checked={renderToggles[key]}
            aria-label={label}
            tabIndex={0}
            onClick={() => setRenderToggle(key, !renderToggles[key])}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                setRenderToggle(key, !renderToggles[key]);
              }
            }}
            style={{
              width: '36px',
              height: '20px',
              borderRadius: '10px',
              backgroundColor: renderToggles[key] ? '#2B5CE6' : '#C2C8CC',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'background-color 150ms',
            }}
          >
            <div
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                backgroundColor: 'white',
                flexShrink: 0,
                marginLeft: renderToggles[key] ? '16px' : '0px',
                transition: 'margin-left 150ms',
              }}
            />
          </div>
          <span
            style={{
              flex: 1,
              fontSize: '14px',
              fontWeight: 400,
              lineHeight: '20px',
              letterSpacing: '0.15px',
              color: '#232729',
              userSelect: 'none',
            }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
