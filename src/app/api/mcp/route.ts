import { NextRequest, NextResponse } from 'next/server'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { isDevMode } from '@/lib/auth'
import { createAnonClient } from '@/lib/supabase/anon'
import { McpContext } from '@/lib/mcp/dispatch'
import { buildServer } from '@/lib/mcp/server'
import { originFrom, wwwAuthenticate } from '@/lib/oauth/core'
import { tokenUsable } from '@/lib/data/oauth'
import { mcpOriginAllowed } from '@/lib/mcp/http-origin'

/**
 * A66: MCP over Streamable HTTP (official SDK), stateless: every POST is answered with plain JSON,
 * no sessions and no server-initiated SSE stream (Vercel functions are short-lived).
 * Same URL and same JSON-RPC POST as before, so existing agents, the aisubal CLI and curl heartbeats
 * keep working: their missing Accept / Content-Type headers are filled in for the transport.
 */
const rpcError = (id: unknown, code: number, message: string, status: number, headers?: Record<string, string>) =>
  NextResponse.json({ jsonrpc: '2.0', error: { code, message }, id: id ?? null }, { status, headers })

/** A66 P4: every 401 points MCP clients at OAuth (RFC 9728); a presented-but-dead token says invalid_token so they refresh */
const unauthorized = (request: NextRequest, id: unknown, message: string, presented: boolean) =>
  rpcError(id, -32001, message, 401, { 'WWW-Authenticate': wwwAuthenticate(originFrom(request.headers), presented) })

type Msg = { method?: unknown; id?: unknown; params?: { clientInfo?: { name?: unknown; version?: unknown } } }

/** What the transport requires of every POST (spec), filled in for pre-SDK clients that only sent JSON. */
function compatRequest(request: NextRequest): Request {
  const headers = new Headers(request.headers)
  const accept = headers.get('accept') ?? ''
  const need = ['application/json', 'text/event-stream'].filter((t) => !accept.includes(t))
  if (need.length) headers.set('accept', [accept, ...need].filter(Boolean).join(', '))
  if (!(headers.get('content-type') ?? '').includes('application/json')) headers.set('content-type', 'application/json')
  return new Request(request.url, { method: 'POST', headers })
}

export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } })
}
export async function DELETE() {
  return new NextResponse('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } })
}

export async function POST(request: NextRequest) {
  try {
    if (!mcpOriginAllowed(request.headers.get('origin'), request.headers.get('host'), process.env.NEXT_PUBLIC_APP_URL)) {
      return rpcError(null, -32003, 'Forbidden origin', 403)
    }
    const authHeader = request.headers.get('authorization')
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    if (!bearer && !isDevMode()) return unauthorized(request, null, 'Unauthorized', false)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return rpcError(null, -32700, 'Parse error', 400)
    }
    const msgs = (Array.isArray(body) ? body : [body]) as Msg[]
    const initialize = msgs.find((m) => m?.method === 'initialize')

    // Connection heartbeat: verifies the token and records first/last connection + client name
    // for the '내 AI 연결하기' live test and the owner's profile.
    const handshake = initialize ?? msgs.find((m) => m?.method === 'tools/list')
    if (handshake && !isDevMode()) {
      const ci = initialize?.params?.clientInfo
      const client = ci ? [ci.name, ci.version].filter((x) => typeof x === 'string' && x).join(' ') : null
      const { data: ok } = await createAnonClient().rpc('mcp_ping', { p_token: bearer, p_client: client || null })
      if (ok !== true) return unauthorized(request, handshake.id, 'Unauthorized: invalid, revoked or expired token', true)
    } else if (bearer && !isDevMode() && msgs.some((m) => m?.id !== undefined)) {
      // A66 P4: OAuth access tokens expire hourly; answer 401 (not a tool error) so the client refreshes
      if (!(await tokenUsable(bearer))) return unauthorized(request, msgs.find((m) => m?.id !== undefined)?.id, 'Unauthorized: invalid, revoked or expired token', true)
    }

    const ctx = new McpContext(bearer, new URL(request.url).origin)
    const server = await buildServer(ctx, { initialize: Boolean(initialize) })
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    await server.connect(transport)
    try {
      return await transport.handleRequest(compatRequest(request), { parsedBody: body })
    } finally {
      await server.close().catch(() => {})
    }
  } catch (error) {
    console.error('MCP error:', error)
    return rpcError(null, -32603, 'Internal error', 500)
  }
}
