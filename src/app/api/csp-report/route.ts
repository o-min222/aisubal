import { NextResponse, type NextRequest } from 'next/server'

/** CSP Report-Only sink (S-3): logs a trimmed violation, never echoes input. */
export async function POST(request: NextRequest) {
  const text = (await request.text().catch(() => '')).slice(0, 4000)
  try {
    const body = JSON.parse(text) as Record<string, unknown>
    const r = (body['csp-report'] ?? (Array.isArray(body) ? body[0]?.body : body)) as Record<string, unknown> | undefined
    console.warn('[csp]', JSON.stringify({
      directive: r?.['violated-directive'] ?? r?.effectiveDirective,
      blocked: r?.['blocked-uri'] ?? r?.blockedURL,
      page: r?.['document-uri'] ?? r?.documentURL,
    }))
  } catch {
    // ignore malformed reports
  }
  return new NextResponse(null, { status: 204 })
}
