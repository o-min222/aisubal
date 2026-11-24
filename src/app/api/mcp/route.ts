import { NextRequest, NextResponse } from 'next/server'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { isDevMode } from '@/lib/auth'
import { createAnonClient } from '@/lib/supabase/anon'
import { McpContext } from '@/lib/mcp/dispatch'
import { buildServer } from '@/lib/mcp/server'

/**
 * A66: MCP over Streamable HTTP (official SDK), stateless: every POST is answered with plain JSON,
 * no sessions and no server-initiated SSE stream (Vercel functions are short-lived).
 * Same URL and same JSON-RPC POST as before, so existing agents, the aisubal CLI and curl heartbeats
 * keep working: their missing Accept / Content-Type headers are filled in for the transport.
 */
const rpcError = (id: unknown, code: number, message: string, status: number) =>
  NextResponse.json({ jsonrpc: '2.0', error: { code, message }, id: id ?? null }, { status })

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
    const authHeader = request.headers.get('authorization')
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    if (!bearer && !isDevMode()) return rpcError(null, -32001, 'Unauthorized', 401)

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
      if (ok !== true) return rpcError(handshake.id, -32001, 'Unauthorized: invalid, revoked or expired token', 401)
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
