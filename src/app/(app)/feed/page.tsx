import Link from 'next/link'
import { redirect } from 'next/navigation'
import { networkHref } from '@/lib/dashboard-tabs'
import { getUserState } from '@/lib/auth'
import { listFeedPage } from '@/lib/data/feed'
import { listSocial } from '@/lib/data/social'
import { FriendRequestsCard } from '@/components/social/friend-requests-card'
import { managedGroupIdentities } from '@/lib/data/groups'
import { composerIdentity } from '@/lib/composer-identity'
import { isFeedId } from '@/lib/feed-ids'
import { FEED_SCOPES, feedHref, parseFeedScope } from '@/lib/social-rules'
import { QuickComposer } from '@/components/feed/quick-composer'
import { FeedFilter } from '@/components/feed/feed-filter'
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
  for_you: { title: msg('추천할 글이 아직 없어요'), hint: msg('사람을 팔로우하거나 글에 좋아요를 누르면 추천이 정교해져요.') },
  following: { title: msg('팔로우한 사람의 글이 아직 없어요'), hint: msg('글 카드나 프로필, 네트워크에서 + 팔로우를 눌러보세요.') },
  friends: { title: msg('친구의 글이 아직 없어요'), hint: msg('친구는 프로필에서 친구 신청 → 수락하면 생겨요. 맞팔과는 달라요.') },
  popular: { title: msg('최근 2주 인기 글이 아직 없어요'), hint: msg('좋아요와 답글이 많은 글이 여기에 모여요.') },
}

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ f?: string; scope?: string; open?: string }> }) {
  const st = await getT()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/')
  if (state.type === 'waitlist') redirect('/waitlist')
  const sp = await searchParams
  const scope = parseFeedScope(sp.f ?? sp.scope)
  // the old reading pane (?open=<id>) is gone: a post opens as its full page in the center
  if (sp.open && isFeedId(sp.open)) redirect(`/posts/${sp.open}`)
  const here = feedHref(scope)

  const [{ posts, totalPages }, groupIdentities, incoming] = await Promise.all([
    listFeedPage(state.member.id, { scope, page: 1 }),
    managedGroupIdentities(state.member.id),
    // A86: incoming friend requests surface here, where people already are (the bell alone went unnoticed)
    listSocial(state.member.id, state.member.id, 'requests', 0, 50).catch(() => []),
  ])

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
      {/* A59: no tab bar — the posts get the space; the scope is one small text menu */}
      <div className="feed-head">
        <FeedFilter active={scope} items={FEED_SCOPES.map((s) => ({ id: s.id, label: s.label, href: feedHref(s.id) }))} />
      </div>
      {/* A62: one light line on every screen size; ⤢ opens the full composer */}
      <QuickComposer me={{ ...composerIdentity(state.member), groupIdentities }} />
      <FriendRequestsCard people={incoming.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl }))} total={incoming.length} />
      {/* A26: whose posts these are, and where to manage that list */}
      {(scope === 'following' || scope === 'friends') && (
        <p className="text-xs text-n-888 px-1 flex items-center gap-2">
          <span className="min-w-0 truncate">{scope === 'following' ? <T>내가 팔로우한 사람의 글</T> : <T>친구의 글</T>}</span>
          <Link href={networkHref({ view: scope })} className="text-link ml-auto whitespace-nowrap">
            {scope === 'following' ? <T>팔로잉 관리</T> : <T>친구 관리</T>} ›
          </Link>
        </p>
      )}
      {scope === 'popular' && <p className="text-xs text-n-888 px-1"><T>최근 2주 · 좋아요와 답글 순</T></p>}
      {scope === 'for_you' && <p className="text-xs text-n-888 px-1"><T>팔로우·친구 관계, 내 관심사, 반응과 최신순을 함께 봐요 · 글 메뉴에서 관심 없음</T></p>}
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
