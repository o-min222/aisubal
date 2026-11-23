import type { RecKind } from '@/lib/data/rec-dismissals'

/** Marks (or un-marks) a recommended item as 관심 없음. Resolves false on any failure, network included. */
export async function postRecDismiss(kind: RecKind, ref: string, dismissed: boolean): Promise<boolean> {
  const res = await fetch('/api/recommendations/dismiss', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, ref, dismissed }),
  }).catch(() => null)
  return Boolean(res?.ok)
}
