import { NextRequest, NextResponse } from 'next/server'
import { originFrom, CORS, authorizationServerMetadata } from '@/lib/oauth/core'

/** RFC 8414: authorization server metadata (the issuer is the site origin) */
export function GET(request: NextRequest) {
  return NextResponse.json(authorizationServerMetadata(originFrom(request.headers)), { headers: { ...CORS, 'Cache-Control': 'public, max-age=3600' } })
}
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
