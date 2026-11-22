import { redirect } from 'next/navigation'
import { getUserState, getNicknameUnlockState } from '@/lib/auth'
import { listFeedPage } from '@/lib/data/feed'
import { composerIdentity } from '@/lib/composer-identity'
import { isFeedId } from '@/lib/feed-ids'
import { FEED_SCOPES, parseFeedScope } from '@/lib/social-rules'
import { Composer } from '@/components/feed/composer'
import { LinkTabs } from '@/components/link-tabs'
import { FeedBoard } from '@/components/feed/feed-board'
import { FeedTimeline } from '@/components/feed/feed-timeline'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('피드 · AI쓰발') }
}

const EMPTY: Record<string, { title: string; hint: string }> = {
  all: { title: msg('아직 글이 없어요'), hint: msg('첫 글을 남겨보세요.') },
  following: { title: msg('팔로우한 사람의 글이 아직 없어요'), hint: msg('글 카드나 프로필, 네트워크에서 + 팔로우를 눌러보세요.') },
  friends: { title: msg('친구의 글이 아직 없어요'), hint: msg('친구는 프로필에서 친구 신청 → 수락하면 생겨요. 맞팔과는 달라요.') },
  popular: { title: msg('최근 2주 인기 글이 아직 없어요'), hint: msg('좋아요와 답글이 많은 글이 여기에 모여요.') },
}

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ scope?: string; open?: string }> }) {
  const st = await getT()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const sp = await searchParams
  const scope = parseFeedScope(sp.scope)
  // the old reading pane (?open=<id>) is gone: a post opens as its full page in the center
  if (sp.open && isFeedId(sp.open)) redirect(`/posts/${sp.open}`)
  const here = scope === 'all' ? '/feed' : `/feed?scope=${scope}`

  const [{ posts, totalPages }, unlock] = await Promise.all([listFeedPage(state.member.id, { scope, page: 1 }), getNicknameUnlockState()])

  async function more(page: number) {
    'use server'
    const s = await getUserState()
    if (s.type !== 'member') return { nodes: null, hasMore: false }
    const r = await listFeedPage(s.member.id, { scope, page })
    return { nodes: r.posts.length ? <FeedTimeline mode="feed" initial={r.posts} stream /> : null, hasMore: page < r.totalPages }
  }

  return (
    <div className="space-y-3 feed-page">
      <h1 className="sr-only"><T>사람 피드</T></h1>
      <div className="card" style={{ padding: '0 8px' }}>
        <LinkTabs
          label={msg('피드 범위')}
          active={scope}
          tabs={FEED_SCOPES.map((s) => ({ id: s.id, label: s.label, href: s.id === 'all' ? '/feed' : `/feed?scope=${s.id}` }))}
          className="feed-scope-tabs"
        />
      </div>
      {<Composer me={composerIdentity(state.member, unlock.unlocked)} className="only-desktop" />}
      {scope === 'popular' && <p className="text-xs text-n-888 px-1"><T>최근 2주 · 좋아요와 답글 순</T></p>}
      <FeedBoard
        mode="feed"
        label={st('피드 글')}
        posts={posts}
        hasMore={totalPages > 1}
        load={more}
        storageKey={here}
        empty={EMPTY[scope]}
      />
    </div>
  )
}
