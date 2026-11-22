import { redirect, notFound } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { getAnonThread } from '@/lib/data/anon'
import { isFeedId } from '@/lib/feed-ids'
import { AnonThreadView } from '@/components/detail/anon-thread-view'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('익명 · AI쓰발') }
}

export default async function AnonThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ reply?: string }>
}) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const { id } = await params
  const { reply } = await searchParams
  if (!isFeedId(id)) notFound()
  const thread = await getAnonThread(id, state.member.id)
  if (!thread) notFound()
  if (thread.root.id !== id) redirect(`/anon/${thread.root.id}`)
  return <AnonThreadView thread={thread} reply={reply} />
}
