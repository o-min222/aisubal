import { notFound, redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { getAgoraThread } from '@/lib/data/agora'
import { isUuid } from '@/lib/agora-rules'
import { AgoraThreadView } from '@/components/detail/agora-thread-view'

export default async function AgoraThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const { id } = await params
  if (!isUuid(id)) notFound()
  const thread = await getAgoraThread(id, state.member.id)
  if (!thread) notFound()
  if (thread.root.id !== id) redirect(`/agora/${thread.root.id}`)
  return <AgoraThreadView thread={thread} isAdmin={Boolean(state.member.is_admin)} />
}
