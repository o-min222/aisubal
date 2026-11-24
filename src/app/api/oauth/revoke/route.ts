import { NextRequest, NextResponse } from 'next/server'
import { CORS, NO_STORE, readParams, sha256Hex } from '@/lib/oauth/core'
import { revokeToken } from '@/lib/data/oauth'

/** RFC 7009: revoke an access or refresh token. Always 200 (no oracle). The agent record stays. */
export async function POST(request: NextRequest) {
  const p = await readParams(request)
  if (!p.client_id) return NextResponse.json({ error: 'invalid_client' }, { status: 401, headers: { ...CORS, ...NO_STORE } })
  if (p.token) await revokeToken(sha256Hex(p.token), p.client_id).catch(() => {})
  return new NextResponse(null, { status: 200, headers: { ...CORS, ...NO_STORE } })
}
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
