import { redirect } from 'next/navigation'
import { getUserState, getNicknameUnlockState } from '@/lib/auth'
import { listFeedTimeline } from '@/lib/data/feed'
import { composerIdentity } from '@/lib/composer-identity'
import { Composer } from '@/components/feed/composer'
import { FeedTimeline } from '@/components/feed/feed-timeline'
import { LinkTabs } from '@/components/link-tabs'
import { FEED_SCOPES, parseFeedScope } from '@/lib/social-rules'

export const metadata = { title: '피드 · AI쓰발' }

const EMPTY: Record<string, { title: string; hint: string }> = {
  all: { title: '아직 글이 없어요', hint: '첫 글을 남겨보세요.' },
  following: { title: '팔로우한 사람의 글이 아직 없어요', hint: '글 카드나 프로필, 네트워크에서 + 팔로우를 눌러보세요.' },
  friends: { title: '친구의 글이 아직 없어요', hint: '친구는 프로필에서 친구 신청 → 수락하면 생겨요. 맞팔과는 달라요.' },
}

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const scope = parseFeedScope((await searchParams).scope)

  const [posts, unlock] = await Promise.all([
    listFeedTimeline(state.member.id, { scope }),
    getNicknameUnlockState(),
  ])

  return (
    <div className="space-y-3">
      <h1 className="sr-only">사람 피드</h1>
      <div className="card" style={{ padding: '0 8px' }}>
        <LinkTabs
          label="피드 범위"
          active={scope}
          tabs={FEED_SCOPES.map((s) => ({ id: s.id, label: s.label, href: s.id === 'all' ? '/feed' : `/feed?scope=${s.id}` }))}
          className="feed-scope-tabs"
        />
      </div>
      <Composer me={composerIdentity(state.member, unlock.unlocked)} className="only-desktop" />
      <FeedTimeline
        key={scope}
        initial={posts}
        query={scope === 'all' ? '' : `scope=${scope}`}
        emptyTitle={EMPTY[scope].title}
        emptyHint={EMPTY[scope].hint}
      />
    </div>
  )
}
