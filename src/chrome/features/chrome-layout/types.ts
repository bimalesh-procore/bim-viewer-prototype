import type { Ref } from 'react';
import type { ModelEntry } from '../header';

export interface ChromeLayoutProps {
  viewerContainerRef?: Ref<HTMLDivElement>;
  showOverlays?: boolean;
  /** null = hidden; 0-100 = visible with that fill % */
  streamingProgress?: number | null;
  /** Popover headline (e.g. "Downloading model"). */
  streamingLabel?: string;
  /** Popover detail line (e.g. "80 MB / 150 MB"). */
  streamingDetail?: string;
  models?: readonly ModelEntry[];
  activeModelId?: string | null;
  onSelectModel?: (model: ModelEntry) => void;
}
