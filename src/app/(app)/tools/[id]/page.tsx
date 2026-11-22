import { redirect, notFound } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { loadToolEntry, ToolDetailView } from '@/components/detail/tool-detail-view'

export default async function ToolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const entry = await loadToolEntry(decodeURIComponent(id))
  if (!entry) notFound()
  return <ToolDetailView entry={entry} member={state.member} />
}
