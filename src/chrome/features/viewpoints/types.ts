import type { MarkupData } from '../viewer-adapter/types';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface SectioningPlaneSnapshot {
  normal: Vec3;
  point: Vec3;
  // 'section-plane' = standalone plane; 'section-cut' = plane originating
  // from a committed section-cut. We capture this so future restore logic
  // can keep the plane in the right toolset, but the actual clip math is
  // identical either way.
  creatorTool: 'section-plane' | 'section-cut';
}

export interface SectioningBoxSnapshot {
  center: Vec3;
  halfExtents: Vec3;
  quaternion: Quat;
}

export interface SectioningSnapshot {
  planes: SectioningPlaneSnapshot[];
  box: SectioningBoxSnapshot | null;
}

export interface Viewpoint {
  id: string;
  name: string;
  cameraPosition: Vec3;
  cameraTarget: Vec3;
  isOrthographic: boolean;
  // List of element IDs that should be hidden when this viewpoint is applied.
  // Storing hidden (rather than visible) IDs keeps payloads small in the
  // common case where most of the model is visible.
  hiddenObjects: string[];
  // Sectioning state — null = no sectioning active for this viewpoint.
  sectioning: SectioningSnapshot | null;
  markups: MarkupData[];
  createdAt: number;
}

export interface ModelViewpoints {
  homeView: Viewpoint | null;
  // Reserved for the future Viewpoints panel. Settings panel doesn't touch this.
  customViews: Viewpoint[];
}

export interface ViewpointsFile {
  schemaVersion: 3;
  models: Record<string, ModelViewpoints>;
}

export type WriteResult =
  | { ok: true }
  | { ok: false; reason: 'writer-unavailable' | 'no-active-model' | 'server-error'; status?: number };

export type { MarkupData };
