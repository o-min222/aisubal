import { redirect, notFound } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { loadToolEntry as loadToolEntryRaw, ToolDetailView } from '@/components/detail/tool-detail-view'
import { cache } from 'react'
import { pageTitle } from '@/lib/page-title'
import { canonical } from '@/lib/canonical'
import { galleryRedirectSlug } from '@/lib/data/toolbox'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
import { getT } from '@/i18n/server'

/** A67: generateMetadata and the page share one load per request. */
const loadToolEntry = cache(loadToolEntryRaw)

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member') return pageTitle(null)
  const entry = await loadToolEntry(decodeURIComponent((await params).id)).catch(() => null)
  return { ...pageTitle(entry?.name, (await getT())('페이지를 찾을 수 없어요 · AI쓰발')), ...canonical(entry ? `/gallery/${encodeURIComponent(entry.slug || entry.id)}` : null) }
}

export default async function ToolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/')
  if (state.type === 'waitlist') redirect('/waitlist')
  const key = decodeURIComponent(id)
  const entry = await loadToolEntry(key)
  if (!entry) {
    // renamed slug (e.g. /gallery/cursor-plugins → /gallery/pstack)
    const moved = await galleryRedirectSlug(key).catch(() => null)
    if (moved) redirect(`/gallery/${encodeURIComponent(moved)}`)
    notFound()
  }
  // one canonical URL per entry: /gallery/<uuid> → /gallery/<slug> (N-6)
  if (UUID_RE.test(key) && entry.slug && entry.slug !== key) redirect(`/gallery/${encodeURIComponent(entry.slug)}`)
  return <ToolDetailView entry={entry} member={state.member} />
}
