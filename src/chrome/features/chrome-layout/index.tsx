import { useFormFactor } from '../form-factor';
import { ChromeLayoutDesktop } from './ChromeLayout.desktop';
import { ChromeLayoutTablet } from './ChromeLayout.tablet';
import { ChromeLayoutPhone } from './ChromeLayout.phone';
import { DeviceFrame } from './DeviceFrame';
import type { ChromeLayoutProps } from './types';

export function ChromeLayout(props: ChromeLayoutProps) {
  const { formFactor } = useFormFactor();

  if (formFactor === 'phone') {
    return (
      <DeviceFrame formFactor="phone">
        <ChromeLayoutPhone {...props} />
      </DeviceFrame>
    );
  }

  if (formFactor === 'tablet') {
    return (
      <DeviceFrame formFactor="tablet">
        <ChromeLayoutTablet {...props} />
      </DeviceFrame>
    );
  }

  return (
    <div className="h-screen w-screen">
      <ChromeLayoutDesktop {...props} />
    </div>
  );
}

export type { ChromeLayoutProps } from './types';
