import { HeaderDesktop } from './Header.desktop';
import type { HeaderProps } from './types';

// Stub: renders the desktop layout until a phone-specific design is implemented.
// Replace the body with phone JSX when Figma specs are available.
export function HeaderPhone(props: HeaderProps) {
  return <HeaderDesktop {...props} />;
}
