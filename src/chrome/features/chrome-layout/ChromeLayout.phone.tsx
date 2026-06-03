import { ChromeLayoutMobile } from './ChromeLayoutMobile';
import type { ChromeLayoutProps } from './types';

export function ChromeLayoutPhone(props: ChromeLayoutProps) {
  return <ChromeLayoutMobile {...props} />;
}
