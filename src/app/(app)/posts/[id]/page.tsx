import { redirect, notFound } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { getFeedThread } from '@/lib/data/feed'
import { isFeedId } from '@/lib/feed-ids'
import { PostThreadView } from '@/components/detail/post-thread-view'
import { pageTitle } from '@/lib/page-title'
import { getT } from '@/i18n/server'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member') return pageTitle(null)
  const thread = await getFeedThread((await params).id, state.member.id).catch(() => null)
  return pageTitle(thread ? thread.root.title || thread.root.body : null, (await getT())('페이지를 찾을 수 없어요 · AI쓰발'))
}

export default async function PostThreadPage({
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
  const thread = await getFeedThread(id, state.member.id)
  if (!thread) notFound()
  if (thread.root.id !== id) redirect(`/posts/${thread.root.id}`)
  return <PostThreadView thread={thread} member={state.member} reply={reply} />
}
