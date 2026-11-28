import { NextRequest, NextResponse } from 'next/server'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { isDevMode } from '@/lib/auth'
import { createAnonClient } from '@/lib/supabase/anon'
import { McpContext } from '@/lib/mcp/dispatch'
import { SERVER_CAPABILITIES, SERVER_INFO, buildServer, instructionsFor } from '@/lib/mcp/server'
import { decorateMcpResult, mockToolsListPut, toolsCatalog, toolsVersion } from '@/lib/mcp/tools-version'
import { MODERN_PROTOCOL_VERSION, SUPPORTED_VERSIONS, SERVER_INFO_KEY, clientNameOf, headerMismatchError, modernize, requestedVersion, versionError } from '@/lib/mcp/modern'
import { originFrom, wwwAuthenticate } from '@/lib/oauth/core'
import { tokenUsable } from '@/lib/data/oauth'
import { mcpOriginAllowed } from '@/lib/mcp/http-origin'
import type { Rpc } from '@/lib/mcp/modern'

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

type Msg = { method?: unknown; id?: unknown; params?: { clientInfo?: { name?: unknown; version?: unknown }; _meta?: Record<string, unknown> } }

/** What the transport requires of every POST (spec), filled in for pre-SDK clients that only sent JSON. */
function compatRequest(request: NextRequest, modern = false): Request {
  const headers = new Headers(request.headers)
  // the SDK transport only knows the 2025 versions; a 2026-07-28 request is handled by the same stateless server
  if (modern) headers.set('mcp-protocol-version', '2025-11-25')
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

    // 2026-07-28 clients name their protocol version in every request's _meta instead of initializing.
    // Anything without that key is a 2025-11-25 (or older) request and takes the exact path it always did.
    const single = !Array.isArray(body) && body && typeof body === 'object' ? (body as Msg) : null
    const asked = requestedVersion(single as Rpc | null)
    if (asked !== undefined && !SUPPORTED_VERSIONS.includes(asked)) return NextResponse.json(versionError(single?.id, asked), { status: 400 })
    const modern = asked === MODERN_PROTOCOL_VERSION
    if (modern) {
      const header = request.headers.get('mcp-protocol-version')
      if (header && header !== asked) return NextResponse.json(headerMismatchError(single?.id, header, asked), { status: 400 })
    }

    // Connection heartbeat: verifies the token and records first/last connection + client name
    // for the '내 AI 연결하기' live test and the owner's profile.
    const handshake = initialize ?? msgs.find((m) => m?.method === 'tools/list' || m?.method === 'server/discover')
    if (handshake && !isDevMode()) {
      const ci = initialize?.params?.clientInfo
      const client = ci ? [ci.name, ci.version].filter((x) => typeof x === 'string' && x).join(' ') : clientNameOf(handshake as Rpc)
      const { data: ok } = await createAnonClient().rpc('mcp_ping', { p_token: bearer, p_client: client || null })
      if (ok !== true) return unauthorized(request, handshake.id, 'Unauthorized: invalid, revoked or expired token', true)
    } else if (bearer && !isDevMode() && msgs.some((m) => m?.id !== undefined)) {
      // A66 P4: OAuth access tokens expire hourly; answer 401 (not a tool error) so the client refreshes
      if (!(await tokenUsable(bearer))) return unauthorized(request, msgs.find((m) => m?.id !== undefined)?.id, 'Unauthorized: invalid, revoked or expired token', true)
    }

    const ctx = new McpContext(bearer, new URL(request.url).origin)
    const listed = msgs.some((m) => m?.method === 'tools/list')
    const filter = await ctx.filter()
    const current = { toolsVersion: toolsVersion(filter), toolsCatalog: toolsCatalog(filter) }
    const hint = listed
      ? { toolsVersion: current.toolsVersion, toolsChanged: false as const }
      : await ctx.catalogHint()
    if (modern && single?.method === 'server/discover') {
      const discover = decorateMcpResult('server/discover', {
        jsonrpc: '2.0',
        id: single.id ?? null,
        result: {
          resultType: 'complete',
          supportedVersions: SUPPORTED_VERSIONS,
          capabilities: SERVER_CAPABILITIES,
          instructions: await instructionsFor(ctx),
          ttlMs: 60_000,
          cacheScope: 'private',
          serverInfo: SERVER_INFO,
          _meta: { [SERVER_INFO_KEY]: SERVER_INFO },
        },
      }, hint)
      return NextResponse.json(discover)
    }
    const server = await buildServer(ctx, { initialize: Boolean(initialize) })
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    await server.connect(transport)
    try {
      const res = await transport.handleRequest(compatRequest(request, modern), { parsedBody: body })
      if (res.status !== 200) return res
      const message = (await res.json()) as Record<string, unknown>
      if (listed) {
        // tools/list is the refresh: record this catalog so later calls stop flagging toolsChanged
        if (ctx.dev || !bearer) mockToolsListPut(bearer, current)
        else {
          const ci = initialize?.params?.clientInfo
          const client = ci ? [ci.name, ci.version].filter((x) => typeof x === 'string' && x).join(' ') : clientNameOf((initialize ?? msgs.find((m) => m?.method === 'tools/list')) as Rpc)
          const { data: ok } = await createAnonClient().rpc('mcp_ping', {
            p_token: bearer,
            p_client: client || null,
            p_tools_version: current.toolsVersion,
            p_tools_catalog: current.toolsCatalog,
          })
          void ok
        }
      }
      const decorated = decorateMcpResult(single?.method ?? (initialize ? 'initialize' : listed ? 'tools/list' : null), message, hint)
      return NextResponse.json(modern ? modernize(single?.method, decorated, SERVER_INFO) : decorated)
    } finally {
      await server.close().catch(() => {})
    }
  } catch (error) {
    console.error('MCP error:', error)
    return rpcError(null, -32603, 'Internal error', 500)
  }
}
