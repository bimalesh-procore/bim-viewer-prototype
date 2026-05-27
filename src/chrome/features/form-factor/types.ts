export type FormFactor = 'desktop' | 'tablet' | 'phone';
export type Orientation = 'portrait' | 'landscape';

export const FORM_FACTORS: readonly FormFactor[] = ['desktop', 'tablet', 'phone'] as const;

// Each form factor has a sensible default orientation. Desktop is conceptually
// always landscape; tablet defaults to landscape; phone defaults to portrait.
export function defaultOrientationFor(ff: FormFactor): Orientation {
  return ff === 'phone' ? 'portrait' : 'landscape';
}
