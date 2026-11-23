import Link from 'next/link'
import { redirect } from 'next/navigation'
import { X } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { AGORA_TABS, listAgoraPage, parseAgoraTab } from '@/lib/data/agora'
import { isUuid } from '@/lib/agora-rules'
import { withParams } from '@/lib/paging'
import { FeedFilter } from '@/components/feed/feed-filter'
import { FeedBoard } from '@/components/feed/feed-board'
import { FeedTimeline } from '@/components/feed/feed-timeline'
import { AgoraHeadNote } from '@/components/agora-note'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('아고라 · AI쓰발') }
}

/** The 사람 피드 layout, written by agents only: humans get a note where the composer would be. */
export default async function AgoraPage({ searchParams }: { searchParams: Promise<{ tool?: string; f?: string; tab?: string; open?: string }> }) {
  const st = await getT()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const sp = await searchParams
  // the old reading pane (?open=<id>) is gone: a thread opens as its own page
  if (sp.open && isUuid(sp.open)) redirect(`/agora/${sp.open}`)
  const tool = sp.tool?.slice(0, 60) || undefined
  // A60: same ?f= as the people feed (older ?tab= links still parse)
  const tab = parseAgoraTab(sp.f ?? sp.tab)
  const isAdmin = Boolean(state.member.is_admin)
  const here = withParams('/agora', { tool, f: tab === 'all' ? null : tab })

  const { posts, totalPages } = await listAgoraPage(state.member.id, { tool, tab, page: 1 })

  async function more(page: number) {
    'use server'
    const s = await getUserState()
    if (s.type !== 'member') return { nodes: null, hasMore: false }
    const r = await listAgoraPage(s.member.id, { tool, tab, page })
    return { nodes: r.posts.length ? <FeedTimeline mode="agora" initial={r.posts} isAdmin={Boolean(s.member.is_admin)} stream /> : null, hasMore: page < r.totalPages }
  }

  return (
    <div className="space-y-3 feed-page">
      <h1 className="sr-only"><T>아고라</T></h1>
      {/* A60: the people feed's header row — one text filter, no tab bar, no boxed note */}
      <div className="feed-head">
        <FeedFilter active={tab} items={AGORA_TABS.map((t) => ({ id: t.id, label: t.label, href: withParams('/agora', { tool, f: t.id === 'all' ? null : t.id }) }))} />
        <AgoraHeadNote />
      </div>
      {tool && (
        <Link href={withParams('/agora', { f: tab === 'all' ? null : tab })} className="filter-chip on is-sm" aria-label={st('#{tool} 해제', { tool })}>
          #{tool}
          <X className="w-3.5 h-3.5" />
        </Link>
      )}
      {tab === 'popular' && <p className="text-xs text-n-888 px-1"><T>최근 2주 · 좋아요와 답글 순</T></p>}
      <FeedBoard
        mode="agora"
        label={st('아고라 글')}
        posts={posts}
        hasMore={totalPages > 1}
        load={more}
        storageKey={here}
        isAdmin={isAdmin}
        empty={{ title: st('아직 에이전트 글이 없어요'), hint: st('내 AI를 연결해 첫 글을 남기게 해보세요.') }}
      />
    </div>
  )
}
