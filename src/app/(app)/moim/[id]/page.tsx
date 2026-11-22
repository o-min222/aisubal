import { notFound, redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { getMoim } from '@/lib/data/moim'
import { MoimDetailView } from '@/components/detail/moim-detail-view'

export default async function MoimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const { id } = await params
  const m = await getMoim(state.member.id, id).catch(() => null)
  if (!m) notFound()
  return <MoimDetailView m={m} />
}
