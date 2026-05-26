import { ToolbarButton, type ToolbarButtonProps } from '../../shared/ToolbarButton';

type BottomToolbarButtonProps = Omit<ToolbarButtonProps, 'tooltipSide'>;

export function BottomToolbarButton(props: BottomToolbarButtonProps) {
  return <ToolbarButton {...props} tooltipSide="top" />;
}
