import { redirect } from 'next/navigation'
import { getUserState, getNicknameUnlockState } from '@/lib/auth'
import { listFeedPage } from '@/lib/data/feed'
import { Pagination } from '@/components/pagination'
import { parsePage } from '@/lib/paging'
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
  popular: { title: '최근 2주 인기 글이 아직 없어요', hint: '좋아요와 답글이 많은 글이 여기에 모여요.' },
}

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ scope?: string; page?: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const sp = await searchParams
  const scope = parseFeedScope(sp.scope)
  const page = parsePage(sp.page)
  const base = scope === 'all' ? '/feed' : `/feed?scope=${scope}`

  const [{ posts, totalPages, total }, unlock] = await Promise.all([
    listFeedPage(state.member.id, { scope, page }),
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
      {page === 1 && <Composer me={composerIdentity(state.member, unlock.unlocked)} className="only-desktop" />}
      {scope === 'popular' && <p className="text-xs text-[#888] px-1">최근 2주 · 좋아요와 답글 순</p>}
      <FeedTimeline
        key={`${scope}-${page}`}
        initial={posts}
        emptyTitle={page > 1 ? '이 페이지에는 글이 없어요' : EMPTY[scope].title}
        emptyHint={page > 1 ? '앞 페이지로 돌아가 보세요.' : EMPTY[scope].hint}
      />
      <Pagination base={base} page={page} totalPages={totalPages} label="피드 페이지" />
      {total > 0 && <p className="text-center text-xs text-[#aaa]">글 {total}개 · {page}/{totalPages} 페이지</p>}
    </div>
  )
}
