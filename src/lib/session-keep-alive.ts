/** Refresh this far before access-token expiry so a PWA resume or next navigation is still fresh. */
export const SESSION_REFRESH_MARGIN_MS = 5 * 60 * 1000
const MIN_RETRY_MS = 30 * 1000

/** Milliseconds until a refresh should run. 0 or negative means refresh now. */
export function msUntilSessionRefresh(
  expiresAtSec: number | null | undefined,
  now = Date.now(),
  marginMs = SESSION_REFRESH_MARGIN_MS
): number {
  if (expiresAtSec == null || !Number.isFinite(expiresAtSec)) return 0
  return expiresAtSec * 1000 - now - marginMs
}

export function shouldRefreshSession(
  expiresAtSec: number | null | undefined,
  now = Date.now(),
  marginMs = SESSION_REFRESH_MARGIN_MS
): boolean {
  return msUntilSessionRefresh(expiresAtSec, now, marginMs) <= 0
}

/** Delay until the next keepalive tick; never faster than 30s when we have an expiry. */
export function nextKeepaliveDelayMs(expiresAtSec: number | null | undefined, now = Date.now()): number {
  const wait = msUntilSessionRefresh(expiresAtSec, now)
  if (expiresAtSec == null || !Number.isFinite(expiresAtSec)) return MIN_RETRY_MS
  return Math.max(MIN_RETRY_MS, wait)
}

/**
 * A148: compare the Origin host with the Host the browser actually sent. nextUrl.origin is what Next
 * resolved (localhost on the dev server), so 127.0.0.1 pages got a 403 on every keep-alive. A browser
 * always sets Host to the server it is talking to, so a cross-site page still cannot match.
 */
export function sameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin) return true
  if (!host) return false
  try {
    return new URL(origin).host === host.toLowerCase()
  } catch {
    return false
  }
}
