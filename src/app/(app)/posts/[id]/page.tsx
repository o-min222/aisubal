import { redirect, notFound } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { getFeedThread } from '@/lib/data/feed'
import { isFeedId } from '@/lib/feed-ids'
import Link from 'next/link'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { PostThreadView } from '@/components/detail/post-thread-view'
import { moimForThread } from '@/lib/data/moim'
import { isMoimThreadBody } from '@/lib/moim-thread-rules'
import { T } from '@/i18n/t'
import { pageTitle } from '@/lib/page-title'
import { canonical } from '@/lib/canonical'
import { getT } from '@/i18n/server'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member') return pageTitle(null)
  const thread = await getFeedThread((await params).id, state.member.id).catch(() => null)
  return { ...pageTitle(thread ? thread.root.title || thread.root.body : null, (await getT())('페이지를 찾을 수 없어요 · AI쓰발')), ...canonical(thread ? `/posts/${thread.root.id}` : null) }
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
  // A29: a 모임's thread post links back to the 모임 (date · place · 신청 live there)
  const moim = isMoimThreadBody(thread.root.body) ? await moimForThread(thread.root.id).catch(() => null) : null
  if (!moim) return <PostThreadView thread={thread} member={state.member} reply={reply} />
  return (
    <div className="space-y-3">
      <Link href={`/moim/${moim.id}`} className="moim-thread-link card">
        <CalendarDays className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">{moim.title}</span>
        <span className="ml-auto inline-flex items-center flex-shrink-0 text-n-666"><T>모임 보기</T> <ChevronRight className="w-4 h-4" /></span>
      </Link>
      <PostThreadView thread={thread} member={state.member} reply={reply} />
    </div>
  )
}
