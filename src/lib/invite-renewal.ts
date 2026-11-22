/** A used invite code comes back as a fresh code one month after use (0045, invites__renew_due). */

/** used_at + 1 calendar month, clamped to the month's last day (same as Postgres `+ interval '1 month'`). */
export function addOneMonth(iso: string): Date {
  const d = new Date(iso)
  const day = d.getUTCDate()
  const r = new Date(d)
  r.setUTCDate(1)
  r.setUTCMonth(r.getUTCMonth() + 1)
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate()
  r.setUTCDate(Math.min(day, last))
  return r
}

/** When this used code renews (null = unused or already renewed). */
export function renewsAt(code: { usedAt: string | null; renewedAt: string | null }): string | null {
  if (!code.usedAt || code.renewedAt) return null
  return addOneMonth(code.usedAt).toISOString()
}

/** Any used code past its renewal date and not yet renewed? (then the loader calls invites__renew_mine). */
export function hasDueRenewal(codes: { usedAt: string | null; renewedAt: string | null }[], now = Date.now()): boolean {
  return codes.some((c) => {
    const at = renewsAt(c)
    return at !== null && Date.parse(at) <= now
  })
}
