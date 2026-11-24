import { notFound, redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { getMoim } from '@/lib/data/moim'
import { MoimDetailView } from '@/components/detail/moim-detail-view'
import { pageTitle } from '@/lib/page-title'
import { getT } from '@/i18n/server'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member') return pageTitle(null)
  const m = await getMoim(state.member.id, (await params).id).catch(() => null)
  return pageTitle(m?.title, (await getT())('페이지를 찾을 수 없어요 · AI쓰발'))
}

export default async function MoimDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reply?: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/')
  if (state.type === 'waitlist') redirect('/waitlist')
  const { id } = await params
  const m = await getMoim(state.member.id, id).catch(() => null)
  if (!m) notFound()
  const { reply } = await searchParams
  return <MoimDetailView m={m} reply={reply} />
}
