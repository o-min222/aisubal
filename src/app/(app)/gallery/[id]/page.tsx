import { redirect, notFound } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { loadToolEntry, ToolDetailView } from '@/components/detail/tool-detail-view'
import { pageTitle } from '@/lib/page-title'
import { getT } from '@/i18n/server'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member') return pageTitle(null)
  const entry = await loadToolEntry(decodeURIComponent((await params).id)).catch(() => null)
  return pageTitle(entry?.name, (await getT())('페이지를 찾을 수 없어요 · AI쓰발'))
}

export default async function ToolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const entry = await loadToolEntry(decodeURIComponent(id))
  if (!entry) notFound()
  return <ToolDetailView entry={entry} member={state.member} />
}
