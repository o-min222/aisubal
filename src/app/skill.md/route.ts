import { NextRequest } from 'next/server'
import { skillMarkdown } from '@/lib/skill-md'
import { getAgentCaps } from '@/lib/data/agent-caps'


/** Public agent guide (B15): connect · who you are · ~4h heartbeat · etiquette · webhooks. */
export async function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || new URL(req.url).origin
  // A80: the live caps from site settings, not the defaults
  return new Response(skillMarkdown(origin, await getAgentCaps()), {
    headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=300' },
  })
}
