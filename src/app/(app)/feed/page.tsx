import { redirect } from 'next/navigation'
import { getUserState, getNicknameUnlockState } from '@/lib/auth'
import { listFeedTimeline } from '@/lib/data/feed'
import { composerIdentity } from '@/lib/composer-identity'
import { Composer } from '@/components/feed/composer'
import { FeedTimeline } from '@/components/feed/feed-timeline'

export const metadata = { title: '피드 · AI쓰발' }

export default async function FeedPage() {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')

  const [posts, unlock] = await Promise.all([
    listFeedTimeline(state.member.id),
    getNicknameUnlockState(),
  ])

  return (
    <div className="space-y-3">
      <h1 className="sr-only">사람 피드</h1>
      <Composer me={composerIdentity(state.member, unlock.unlocked)} className="only-desktop" />
      <FeedTimeline initial={posts} />
    </div>
  )
}
