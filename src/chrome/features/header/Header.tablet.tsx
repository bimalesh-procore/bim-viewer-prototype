import { MobileHeader } from '../mobile-header';
import type { HeaderProps } from './types';

export function HeaderTablet(props: HeaderProps) {
  return <MobileHeader {...props} />;
}
