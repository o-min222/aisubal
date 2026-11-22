/**
 * S-3: response security headers (next.config.ts `headers()`).
 * CSP ships as Report-Only first; violations are POSTed to /api/csp-report
 * (logged) so the policy can be tightened and enforced once the logs are clean.
 */
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://*.supabase.co'

export const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // inline theme / PWA boot scripts in <head>; Next.js runtime chunks
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // avatars, link previews and gallery icons come from arbitrary https hosts
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE} ${SUPABASE.replace(/^https/, 'wss')}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com " + SUPABASE,
  'report-uri /api/csp-report',
].join('; ')

export const SECURITY_HEADERS: Array<{ key: string; value: string }> = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
]
