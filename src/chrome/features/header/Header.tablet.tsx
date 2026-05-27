import { HeaderDesktop } from './Header.desktop';
import type { HeaderProps } from './types';

// Stub: renders the desktop layout until a tablet-specific design is implemented.
// Replace the body with tablet JSX when Figma specs are available.
export function HeaderTablet(props: HeaderProps) {
  return <HeaderDesktop {...props} />;
}
