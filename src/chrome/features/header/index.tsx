import { useFormFactor } from '../form-factor';
import { HeaderDesktop } from './Header.desktop';
import { HeaderTablet } from './Header.tablet';
import { HeaderPhone } from './Header.phone';
import type { HeaderProps } from './types';

export function Header(props: HeaderProps) {
  const { formFactor } = useFormFactor();
  if (formFactor === 'phone') return <HeaderPhone {...props} />;
  if (formFactor === 'tablet') return <HeaderTablet {...props} />;
  return <HeaderDesktop {...props} />;
}

export type { ModelEntry, HeaderProps } from './types';
