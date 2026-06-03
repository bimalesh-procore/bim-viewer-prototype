import { ChromeLayoutMobile } from './ChromeLayoutMobile';
import type { ChromeLayoutProps } from './types';

export function ChromeLayoutTablet(props: ChromeLayoutProps) {
  return <ChromeLayoutMobile {...props} />;
}
