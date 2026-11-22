import { getPublicBundle } from '@/lib/data/archive'
import { bundleMarkdown } from '@/lib/archive-rules'
import { bundleLabels } from '@/lib/archive-bundle-i18n'

/** Stable per-bundle link: plain Markdown for any AI (anonymous-board items are never included). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const b = await getPublicBundle(token)
  if (!b) return new Response('Not found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  const lang = new URL(req.url).searchParams.get('lang') === 'en' ? 'en' : 'ko'
  const md = bundleMarkdown(b.items, { origin: new URL(req.url).origin, ...bundleLabels(lang) })
  return new Response(md, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'private, max-age=60', 'X-Robots-Tag': 'noindex, nofollow' },
  })
}
