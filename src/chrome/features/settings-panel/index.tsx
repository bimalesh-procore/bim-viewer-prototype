import { useFormFactor } from '../form-factor';
import { SettingsPanelDesktop } from './SettingsPanel.desktop';
import { SettingsPanelTablet } from './SettingsPanel.tablet';
import { SettingsPanelPhone } from './SettingsPanel.phone';

interface SettingsPanelProps {
  onClose: () => void;
  onUpdateHomeView: () => void;
  homeViewDisabled?: boolean;
}

export function SettingsPanel(props: SettingsPanelProps) {
  const { formFactor } = useFormFactor();
  if (formFactor === 'phone') return <SettingsPanelPhone {...props} />;
  if (formFactor === 'tablet') return <SettingsPanelTablet {...props} />;
  return <SettingsPanelDesktop {...props} />;
}

export { useSettingsPanel } from './useSettingsPanel';
