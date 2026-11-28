/**
 * Invite batches (0085): a member holds N codes (admin setting invites_per_member). When every code of
 * the current batch has been used (each invitee completed signup), the database issues the next batch
 * of N at once and awards the 'invite_king' badge. Unused codes never expire.
 */

type BatchCode = { batch: number; isUsed: boolean }

export type BatchProgress = {
  /** current batch number (1 = the first codes) */
  batch: number
  /** invitees of the current batch who joined */
  joined: number
  /** codes in the current batch (the bar's total; N once topped up) */
  size: number
  /** batches already completed (= invite_king metric) */
  completed: number
}

export function batchProgress(codes: BatchCode[], allowance: number): BatchProgress {
  const batch = codes.reduce((b, c) => Math.max(b, c.batch || 1), 1)
  const current = codes.filter((c) => (c.batch || 1) === batch)
  return { batch, joined: current.filter((c) => c.isUsed).length, size: Math.max(current.length, allowance), completed: batch - 1 }
}

/** Should the loader ask the database to top up / heal (invites__renew_mine)? */
export function needsRefill(codes: BatchCode[], allowance: number): boolean {
  const p = batchProgress(codes, allowance)
  const current = codes.filter((c) => (c.batch || 1) === p.batch)
  return current.length < allowance || current.every((c) => c.isUsed)
}

/** Current batch first (newest codes on top of the list), older batches after. */
export function sortByBatch<T extends BatchCode>(codes: T[]): T[] {
  return codes.map((c, i) => ({ c, i })).sort((a, b) => (b.c.batch || 1) - (a.c.batch || 1) || a.i - b.i).map((x) => x.c)
}
