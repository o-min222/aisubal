/** Streamable HTTP: if Origin is present it must be this site (DNS-rebinding guard). Missing Origin (Cursor, Claude Code, curl) is allowed. */
export function mcpOriginAllowed(origin: string | null | undefined, requestHost?: string | null, appUrl?: string | null): boolean {
  if (!origin) return true
  let host: string
  try {
    host = new URL(origin).hostname
  } catch {
    return false
  }
  const allowed = new Set<string>(['localhost', '127.0.0.1'])
  if (requestHost) allowed.add(requestHost.split(':')[0]!)
  if (appUrl) {
    try {
      allowed.add(new URL(appUrl).hostname)
    } catch {
      /* ignore bad NEXT_PUBLIC_APP_URL */
    }
  }
  if (allowed.has(host)) return true
  return host === 'aisubal.vercel.app' || (host.startsWith('aisubal-') && host.endsWith('.vercel.app'))
}
