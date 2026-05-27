import type { ReactNode } from 'react';

interface BottomToolbarGroupProps {
  children: ReactNode;
}

export function BottomToolbarGroup({ children }: BottomToolbarGroupProps) {
  return <div className="flex items-center gap-1">{children}</div>;
}
