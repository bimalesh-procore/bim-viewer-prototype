import type { Ref } from 'react';

interface ViewerCanvasProps {
  viewerContainerRef?: Ref<HTMLDivElement>;
}

export function ViewerCanvas({ viewerContainerRef }: ViewerCanvasProps) {
  return (
    <div
      ref={viewerContainerRef}
      className="absolute inset-0 bg-gray-100"
    />
  );
}
