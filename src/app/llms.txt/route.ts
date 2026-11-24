import { NextRequest } from 'next/server'
import { llmsTxt } from '@/lib/llms-txt'

/** A80: /llms.txt for AI crawlers and agents, generated from the MCP catalog. */
export function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || new URL(req.url).origin
  return new Response(llmsTxt(origin), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  })
}
