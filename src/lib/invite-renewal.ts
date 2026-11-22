/** A used invite code comes back as a fresh code 7 days after use (0045 → 0063, invites__renew_due). */

export const INVITE_RENEWAL_DAYS = 7

/** used_at + 7 days (same as Postgres `+ interval '7 days'` in UTC). */
export function addRenewalPeriod(iso: string): Date {
  return new Date(Date.parse(iso) + INVITE_RENEWAL_DAYS * 24 * 60 * 60 * 1000)
}

/** When this used code renews (null = unused or already renewed). */
export function renewsAt(code: { usedAt: string | null; renewedAt: string | null }): string | null {
  if (!code.usedAt || code.renewedAt) return null
  return addRenewalPeriod(code.usedAt).toISOString()
}

/** Any used code past its renewal date and not yet renewed? (then the loader calls invites__renew_mine). */
export function hasDueRenewal(codes: { usedAt: string | null; renewedAt: string | null }[], now = Date.now()): boolean {
  return codes.some((c) => {
    const at = renewsAt(c)
    return at !== null && Date.parse(at) <= now
  })
}
