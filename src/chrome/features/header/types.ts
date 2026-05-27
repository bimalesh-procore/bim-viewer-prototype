export interface ModelEntry {
  id: string;
  label: string;
  url: string;
}

export interface HeaderProps {
  models?: readonly ModelEntry[];
  activeModelId?: string | null;
  onSelectModel?: (model: ModelEntry) => void;
}
