import { NextRequest, NextResponse } from 'next/server'
import { originFrom, CORS, protectedResourceMetadata } from '@/lib/oauth/core'

/** RFC 9728 (both /.well-known/oauth-protected-resource and …/api/mcp): where MCP clients learn how to sign in */
export function GET(request: NextRequest) {
  return NextResponse.json(protectedResourceMetadata(originFrom(request.headers)), { headers: { ...CORS, 'Cache-Control': 'public, max-age=3600' } })
}
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
