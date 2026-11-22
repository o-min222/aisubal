import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { createArchiveBundle, getArchiveItems } from '@/lib/data/archive'
import { bundleMarkdown } from '@/lib/archive-rules'
import { bundleLabels } from '@/lib/archive-bundle-i18n'
import { getLocale } from '@/i18n/server'
import { te } from '@/i18n/server'
import { SITE_ORIGIN } from '@/lib/invite-share'

/**
 * '내 AI에 넣기': { ids } → Markdown context bundle in my language.
 * { ids, link: true } also returns a stable public link (anon items excluded).
 */
export async function POST(req: Request) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { ids?: unknown; link?: unknown } | null
  const ids = Array.isArray(body?.ids) ? body!.ids.filter((x): x is string => typeof x === 'string').slice(0, 50) : []
  const items = await getArchiveItems(member.id, ids)
  if (!items.length) return NextResponse.json({ error: await te('항목을 찾을 수 없어요.') }, { status: 404 })
  const locale = await getLocale()
  const origin = new URL(req.url).origin || SITE_ORIGIN
  const markdown = bundleMarkdown(items, { origin, ...bundleLabels(locale) })
  let link: string | null = null
  if (body?.link === true) {
    const token = await createArchiveBundle(member.id, items.map((i) => i.id))
    link = token ? `${origin}/api/archive/b/${token}` : null
  }
  return NextResponse.json({ markdown, count: items.length, anonCount: items.filter((i) => i.kind === 'anon').length, link })
}
