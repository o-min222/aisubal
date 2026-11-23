import { redirect } from 'next/navigation'
import { VenetianMask } from 'lucide-react'
import { getAnonUnlockState, getUserState } from '@/lib/auth'
import { AnonLocked } from '@/components/anon/anon-locked'
import { listAnon } from '@/lib/data/anon'
import { ANON_CATEGORIES, ANON_NOTICE, isAnonCategory, parseSort, type AnonCategory, type AnonSort } from '@/lib/anon-rules'
import { isFeedId } from '@/lib/feed-ids'
import { PAGE_SIZE, pageOffset } from '@/lib/paging'
import { LinkTabs } from '@/components/link-tabs'
import { AnonComposer } from '@/components/anon/anon-composer'
import { FeedBoard } from '@/components/feed/feed-board'
import { FeedTimeline } from '@/components/feed/feed-timeline'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'
import { msg } from '@/i18n/translate'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('익명 · AI쓰발') }
}

function hrefFor(category: AnonCategory | null, sort: AnonSort) {
  const q = new URLSearchParams()
  if (category) q.set('category', category)
  if (sort === 'popular') q.set('sort', 'popular')
  const s = q.toString()
  return s ? `/anon?${s}` : '/anon'
}

/** one extra row tells whether another chunk exists */
async function anonChunk(viewerId: string, category: AnonCategory | null, sort: AnonSort, page: number) {
  const rows = await listAnon(viewerId, { category, sort, offset: pageOffset(page), limit: PAGE_SIZE + 1 })
  return { posts: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE }
}

/** The 사람 피드 layout with aliases instead of names. */
export default async function AnonBoardPage({ searchParams }: { searchParams: Promise<{ category?: string; sort?: string; open?: string }> }) {
  const st = await getT()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const unlock = await getAnonUnlockState()
  if (!unlock.unlocked) return <AnonLocked threshold={unlock.threshold} activeCount={unlock.activeCount} />
  const sp = await searchParams
  if (sp.open && isFeedId(sp.open)) redirect(`/anon/${sp.open}`)
  const category = isAnonCategory(sp.category) ? sp.category : null
  const sort = parseSort(sp.sort)
  const here = hrefFor(category, sort)
  const { posts, hasMore } = await anonChunk(state.member.id, category, sort, 1)

  async function more(page: number) {
    'use server'
    const s = await getUserState()
    if (s.type !== 'member') return { nodes: null, hasMore: false }
    const r = await anonChunk(s.member.id, category, sort, page)
    return { nodes: r.posts.length ? <FeedTimeline mode="anon" initial={r.posts} stream /> : null, hasMore: r.hasMore }
  }

  // one tab row like the feed: 최신 · 인기 · then each topic
  const tabs = [
    { id: 'all', label: msg('최신'), href: '/anon' },
    { id: 'popular', label: msg('인기'), href: hrefFor(null, 'popular') },
    ...ANON_CATEGORIES.map((c) => ({ id: c.id, label: c.label, href: hrefFor(c.id, 'latest') })),
  ]
  const active = category ?? (sort === 'popular' ? 'popular' : 'all')

  return (
    <div className="space-y-3 feed-page">
      <h1 className="sr-only"><T>익명 라운지</T></h1>
      <div className="card" style={{ padding: '0 8px' }}>
        <LinkTabs label={msg('익명 라운지 보기')} active={active} tabs={tabs} className="feed-scope-tabs" />
      </div>
      {/* phones have no composer here (the ✎ button opens /anon/new), so the notice stands in for it */}
      <div className="board-note board-note-phone">
        <VenetianMask className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1"><T>{ANON_NOTICE}</T></p>
      </div>
      <AnonComposer key={category || 'all'} defaultCategory={category} className="only-desktop" redirectTo="timeline" />
      {sort === 'popular' && <p className="text-xs text-n-888 px-1"><T>최근 30일 · 좋아요와 답글 순</T></p>}
      <FeedBoard
        mode="anon"
        label={st('익명 글')}
        posts={posts}
        hasMore={hasMore}
        load={more}
        storageKey={here}
        empty={{ title: st('아직 글이 없어요'), hint: st('첫 익명 글을 남겨보세요. 회원에게는 누군지 보이지 않아요.') }}
      />
    </div>
  )
}
