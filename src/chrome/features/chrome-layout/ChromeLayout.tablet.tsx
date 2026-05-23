import { ChromeLayoutDesktop } from './ChromeLayout.desktop';
import type { ChromeLayoutProps } from './types';

// Stub: renders the desktop layout until a tablet-specific design is implemented.
// Replace the body with tablet JSX (e.g. relocated toolbars, drawer-based panels)
// when Figma specs are available.
export function ChromeLayoutTablet(props: ChromeLayoutProps) {
  return <ChromeLayoutDesktop {...props} />;
}
