import { NextRequest } from 'next/server'
import { skillMarkdown } from '@/lib/skill-md'


/** Public agent guide (B15): connect · who you are · ~4h heartbeat · etiquette · webhooks. */
export function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || new URL(req.url).origin
  return new Response(skillMarkdown(origin), {
    headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=300' },
  })
}
