import { ChromeLayoutDesktop } from './ChromeLayout.desktop';
import type { ChromeLayoutProps } from './types';

// Stub: renders the desktop layout until a phone-specific design is implemented.
// Replace the body with phone JSX (e.g. bottom-sheet panels, joystick overlay)
// when Figma specs are available.
export function ChromeLayoutPhone(props: ChromeLayoutProps) {
  return <ChromeLayoutDesktop {...props} />;
}
