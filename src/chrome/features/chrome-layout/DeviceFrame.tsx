import { useLayoutEffect, useState, type ReactNode } from 'react';
import { RotateCw } from 'lucide-react';
import { useFormFactor, type FormFactor, type Orientation } from '../form-factor';

// "Screen" dimensions are the chrome's coordinate space — the chrome renders
// at these pixel dimensions internally, then we visually scale it via CSS
// transform to fit the user's viewport.
const SCREEN_DIMENSIONS: Record<'tablet' | 'phone', Record<Orientation, { width: number; height: number }>> = {
  tablet: {
    landscape: { width: 1194, height: 834 },
    portrait: { width: 834, height: 1194 },
  },
  phone: {
    landscape: { width: 852, height: 393 },
    portrait: { width: 393, height: 852 },
  },
};

// Bezel thickness in **visual** (CSS) pixels — sits outside the scale
// transform so it looks identical regardless of how the chrome inside is
// scaled to fit the user's viewport.
const BEZEL_VISUAL: Record<'tablet' | 'phone', number> = {
  tablet: 11,
  phone: 8,
};

// Inner screen corner radius (CSS px). The outer device radius is derived as
// SCREEN_CORNER_VISUAL + bezel so the inner and outer curves are concentric
// — the bezel reads as a uniform ring all the way around the corner.
const SCREEN_CORNER_VISUAL: Record<'tablet' | 'phone', number> = {
  tablet: 12,
  phone: 30,
};

interface DeviceFrameProps {
  formFactor: Exclude<FormFactor, 'desktop'>;
  children: ReactNode;
}

export function DeviceFrame({ formFactor, children }: DeviceFrameProps) {
  const { orientation, toggleOrientation } = useFormFactor();
  const { width: screenW, height: screenH } = SCREEN_DIMENSIONS[formFactor][orientation];
  const bezel = BEZEL_VISUAL[formFactor];

  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const update = () => {
      // Leave breathing room for letterboxing + rotation button + bezel.
      const margin = 96;
      const vw = window.innerWidth - margin * 2 - bezel * 2;
      const vh = window.innerHeight - margin * 2 - bezel * 2;
      setScale(Math.min(vw / screenW, vh / screenH, 1));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [screenW, screenH, bezel]);

  const visualScreenW = screenW * scale;
  const visualScreenH = screenH * scale;
  const visualDeviceW = visualScreenW + bezel * 2;
  const visualDeviceH = visualScreenH + bezel * 2;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#e5e9ec]">
      <div className="relative" style={{ width: visualDeviceW, height: visualDeviceH }}>
        {/* Device body — bezel at fixed visual thickness, not transformed. */}
        <div
          className="absolute inset-0 bg-[#1c1c1e] shadow-2xl ring-1 ring-black/30"
          style={{ borderRadius: SCREEN_CORNER_VISUAL[formFactor] + bezel, padding: bezel }}
        >
          {/* Inner screen viewport — receives chrome scaled to fit. */}
          <div
            className="relative w-full h-full overflow-hidden bg-white"
            style={{ borderRadius: SCREEN_CORNER_VISUAL[formFactor] }}
          >
            {/* Scaled chrome — renders at the chrome's native pixel dimensions
                and is visually shrunk to fit the screen viewport. */}
            <div
              className="absolute top-0 left-0 origin-top-left"
              style={{ width: screenW, height: screenH, transform: `scale(${scale})` }}
            >
              {children}
            </div>
            {formFactor === 'phone' && <PhoneNotch orientation={orientation} />}
            {formFactor === 'phone' && <PhoneHomeIndicator orientation={orientation} />}
          </div>
        </div>

        <button
          type="button"
          onClick={toggleOrientation}
          aria-label={`Rotate to ${orientation === 'portrait' ? 'landscape' : 'portrait'}`}
          title={`Rotate to ${orientation === 'portrait' ? 'landscape' : 'portrait'}`}
          className="absolute top-0 right-0 translate-x-[calc(100%+12px)] flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-md transition-colors hover:bg-gray-50"
        >
          <RotateCw size={16} />
        </button>
      </div>
    </div>
  );
}

function PhoneNotch({ orientation }: { orientation: Orientation }) {
  // The notch sits at the top of the screen in portrait, and rotates to the
  // left edge in landscape. Positioned absolutely inside the screen viewport
  // so it overlays the chrome (mimicking how a real cutout intrudes).
  if (orientation === 'portrait') {
    return (
      <div
        className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 z-[100] bg-black"
        style={{ width: 76, height: 20, borderRadius: 999 }}
      />
    );
  }
  return (
    <div
      className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 z-[100] bg-black"
      style={{ width: 20, height: 76, borderRadius: 999 }}
    />
  );
}

function PhoneHomeIndicator({ orientation }: { orientation: Orientation }) {
  // Subtle gesture bar at the screen edge opposite the notch.
  if (orientation === 'portrait') {
    return (
      <div
        className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 z-[100] bg-gray-400/70"
        style={{ width: 90, height: 4, borderRadius: 999 }}
      />
    );
  }
  return (
    <div
      className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 z-[100] bg-gray-400/70"
      style={{ width: 4, height: 90, borderRadius: 999 }}
    />
  );
}
