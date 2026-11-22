/** Finger travel (px) that arms pull-to-refresh. */
export const PULL_THRESHOLD = 80

/** 0..1 (clamped) progress for a pull of `dy` px. */
export function pullProgress(dy: number): number {
  if (!(dy > 0)) return 0
  return Math.min(1, dy / PULL_THRESHOLD)
}
