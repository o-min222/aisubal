import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { Heart, MessageCircle, ScrollText, Settings } from 'lucide-react'
import { BadgeChips } from '@/components/profile/badge-chips'
import { listMemberBadges } from '@/lib/data/badges'
import { getUserState } from '@/lib/auth'
import { getProfileStats } from '@/lib/data/shell'
import { getPledgeStatus } from '@/lib/data/pledge'
import { recordNo, shortHash } from '@/lib/pledge-record'
import { getDashboardStats, listMyComments, listMyLikedPosts, type DashItem } from '@/lib/data/dashboard'
import { listFeedPage } from '@/lib/data/feed'
import { listMyArticles } from '@/lib/data/articles'
import { articleEditHref, articleHref } from '@/lib/article-rules'
import { listMemberTools } from '@/lib/data/tools'
import { listMoim, type Moim } from '@/lib/data/moim'
import { listMyGroups } from '@/lib/data/groups'
import { listProfileAgents } from '@/lib/data/tokens'
import { DASHBOARD_TABS, dashboardHref, networkHref, pageSlice, parseDashboardTab, type DashboardTab } from '@/lib/dashboard-tabs'
import { PAGE_SIZE } from '@/lib/paging'
import { toolHref, TOOL_TYPE_CHIP } from '@/lib/tool-rules'
import { RSVP_LABEL } from '@/lib/moim-rules'
import { ROLE_LABEL } from '@/lib/group-rules'
import { LinkTabs } from '@/components/link-tabs'
import { InfiniteList } from '@/components/infinite/infinite-list'
import { RelativeTime } from '@/components/relative-time'
import { ToolIcon } from '@/components/tools/tool-icon'
import { T } from '@/i18n/t'
import { getLocale, getT } from '@/i18n/server'
import { LOCALE_META } from '@/i18n/config'
import { msg } from '@/i18n/translate'
import { GroupAvatar } from '@/components/groups/group-avatar'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { agentActivityFeed } from '@/lib/agent-activity'
import type { AgentActivityKind } from '@/lib/agent-profile'

const AGENT_ACT_LABEL: Record<AgentActivityKind, string> = {
  agora_post: msg('아고라 글'),
  agora_reply: msg('아고라 답글'),
  feed_reply: msg('피드 댓글'),
}

export async function generateMetadata() {
  const t = await getT()
  return { title: t('내 대시보드 · AI쓰발') }
}

const TAB_IDS = DASHBOARD_TABS.map((t) => t.id)

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-n-888">{children}</p>
}

function Row({ href, children, meta }: { href: string; children: ReactNode; meta?: ReactNode }) {
  return (
    <li>
      <Link href={href} className="dash-row block px-4 py-3 hover:bg-n-fafafa">
        <div className="text-[14.5px] text-n-222 line-clamp-2 break-words">{children}</div>
        {meta && <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-n-888">{meta}</div>}
      </Link>
    </li>
  )
}

function PostRows({ items, empty }: { items: DashItem[]; empty: string }) {
  if (!items.length) return <Empty><T>{empty}</T></Empty>
  return (
    <ul className="divide-y divide-n-f0f0f0">
      {items.map((p) => (
        <Row
          key={p.id}
          href={p.href}
          meta={
            <>
              {p.reposted && <span className="text-n-555"><T>리포스트함</T></span>}
              {p.authorName && <span className="text-n-555">{p.authorName}</span>}
              {p.isNickname && <span className="badge"><T>부캐</T></span>}
              <RelativeTime date={p.createdAt} />
              <span className="inline-flex items-center gap-0.5"><Heart className="w-3 h-3" /> {p.likeCount}</span>
              {p.replyCount > 0 && <span className="inline-flex items-center gap-0.5"><MessageCircle className="w-3 h-3" /> {p.replyCount}</span>}
            </>
          }
        >
          {p.title && <b className="text-n-111">{p.title} </b>}
          {p.body || <T>(내용 없음)</T>}
        </Row>
      ))}
    </ul>
  )
}

function moimRole(m: Moim): string {
  if (m.isHost || m.canManage) return msg('주최')
  return m.myRsvp ? RSVP_LABEL[m.myRsvp.status] : msg('신청')
}

/** The rows of a paged dashboard tab (page 1 on the server render, later pages via infinite scroll). */
async function myMoims(meId: string): Promise<Moim[]> {
  const [mine, hosting] = await Promise.all([listMoim(meId, 'mine', null, 100).catch(() => [] as Moim[]), listMoim(meId, 'hosting', null, 100).catch(() => [] as Moim[])])
  return [...new Map([...hosting, ...mine].map((m) => [m.id, m])).values()].sort((x, y) => y.startsAt.localeCompare(x.startsAt))
}

async function dashboardListChunk(meId: string, tab: DashboardTab, page: number): Promise<{ nodes: ReactNode; totalPages: number }> {
  const t = await getT()
  const locale = await getLocale()
  let body: ReactNode = null
  let totalPages = 1
  if (tab === 'articles') {
    const mine = await listMyArticles()
    const sliced = pageSlice(mine.articles, page, PAGE_SIZE)
    totalPages = sliced.totalPages
    body = (
      <PostRows
        empty={t('아직 쓴 아티클이 없어요.')}
        items={sliced.items.map((a) => ({
          id: a.id,
          href: a.status === 'published' ? articleHref(a.slug) : articleEditHref(a.slug || a.id),
          title: a.title,
          body: a.subtitle || (a.status === 'published' ? t('발행됨') : t('초고')),
          createdAt: a.updatedAt || a.createdAt,
          likeCount: a.likeCount,
          replyCount: a.commentCount,
          isNickname: false,
        }))}
      />
    )
  } else if (tab === 'posts') {
    const r = await listFeedPage(meId, { authorId: meId, includeNickname: true, page })
    totalPages = r.totalPages
    body = (
      <PostRows
        empty={t('아직 쓴 글이 없어요.')}
        items={r.posts.map((p) => ({
          id: p.repostedBy ? `repost:${p.repostedBy.id}:${p.id}` : p.id,
          href: `/posts/${p.id}`,
          title: p.title ?? null,
          body: p.body || p.linkPreview?.title || p.linkUrl || '',
          createdAt: p.repostedBy?.at ?? p.createdAt,
          likeCount: p.likeCount,
          replyCount: p.replyCount,
          isNickname: Boolean(p.isNickname),
          reposted: Boolean(p.repostedBy),
        }))}
      />
    )
  } else if (tab === 'comments') {
    const r = await listMyComments(meId, page).catch(() => ({ items: [], totalPages: 1 }))
    totalPages = r.totalPages
    body = <PostRows items={r.items} empty={msg('아직 남긴 댓글이 없어요.')} />
  } else if (tab === 'likes') {
    const r = await listMyLikedPosts(meId, page).catch(() => ({ items: [], totalPages: 1 }))
    totalPages = r.totalPages
    body = <PostRows items={r.items} empty={msg('아직 좋아요한 글이 없어요.')} />
  } else if (tab === 'tools') {
    const s = pageSlice(await listMemberTools(meId).catch(() => []), page, PAGE_SIZE)
    totalPages = s.totalPages
    body = s.items.length ? (
      <ul className="divide-y divide-n-f0f0f0">
        {s.items.map((t) => (
          <li key={t.id}>
            <Link href={toolHref(t)} className="flex items-center gap-3 px-4 py-3 hover:bg-n-fafafa">
              <ToolIcon name={t.name} iconUrl={t.icon_url} dim="w-9 h-9" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-n-111 truncate">{t.name}</span>
                <span className="block text-xs text-n-888 truncate">{t.one_liner}</span>
              </span>
              <span className="badge"><T>{TOOL_TYPE_CHIP[t.type] ?? t.type}</T></span>
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      <Empty>
        <T>아직 ‘쓰는 중’으로 표시한 게 없어요.</T> <Link href="/gallery" className="text-link"><T>갤러리 둘러보기</T></Link>
      </Empty>
    )
  } else if (tab === 'moim') {
    const s = pageSlice(await myMoims(meId), page, PAGE_SIZE)
    totalPages = s.totalPages
    body = s.items.length ? (
      <ul className="divide-y divide-n-f0f0f0">
        {s.items.map((m) => (
          <Row
            key={m.id}
            href={`/moim/${m.id}`}
            meta={
              <>
                <span className="badge">{moimRole(m)}</span>
                <span>{new Date(m.startsAt).toLocaleString(LOCALE_META[locale].intl, { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <span><T s="{confirmed}/{capacity}명" vars={{ confirmed: m.confirmed, capacity: m.capacity }} /></span>
                {m.group && <span>· {m.group.name}</span>}
                {m.status === 'cancelled' && <span className="text-c-e5484d"><T>취소됨</T></span>}
              </>
            }
          >
            <b className="text-n-111">{m.title}</b>
          </Row>
        ))}
      </ul>
    ) : (
      <Empty>
        <T>신청했거나 주최한 모임이 없어요.</T> <Link href="/moim" className="text-link"><T>모임 보기</T></Link>
      </Empty>
    )
  } else if (tab === 'groups') {
    const s = pageSlice(await listMyGroups(meId, true).catch(() => []), page, PAGE_SIZE)
    totalPages = s.totalPages
    body = s.items.length ? (
      <ul className="divide-y divide-n-f0f0f0">
        {s.items.map((g) => (
          <li key={g.id}>
            <Link href={`/groups/${g.slug}`} className="flex items-center gap-3 px-4 py-3 hover:bg-n-fafafa">
              <GroupAvatar name={g.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-n-111 truncate">{g.name}</span>
                <span className="block text-xs text-n-888"><T s="멤버 {memberCount} · 글 {postCount}" vars={{ memberCount: g.memberCount, postCount: g.postCount }} /></span>
              </span>
              <span className="badge">{g.myStatus === 'pending' ? <T>가입 요청 중</T> : g.myStatus === 'invited' ? <T>초대받음</T> : g.myRole ? ROLE_LABEL[g.myRole] : <T>멤버</T>}</span>
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      <Empty>
        <T>가입한 그룹이 없어요.</T> <Link href="/groups" className="text-link"><T>그룹 둘러보기</T></Link>
      </Empty>
    )
  }
  return { nodes: body, totalPages }
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ tab?: string; view?: string; root?: string; q?: string }> }) {
  const st = await getT()
  const t = await getT()
  const locale = await getLocale()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/')
  if (state.type === 'waitlist') redirect('/waitlist')
  const me = state.member
  const sp = await searchParams
  // A70: the invite network + social lists moved to 친구·팔로워 (old links, incl. notification links)
  if (sp.tab === 'network') redirect(networkHref({ view: sp.view, root: sp.root }))
  // A71: 초대 현황 duplicated /invites (codes, who joined, progress); one home
  if (sp.tab === 'invites') redirect('/invites')
  const tab = parseDashboardTab(sp.tab)

  const [profile, tools, moimMine, moimHosting, groups, agents, badges] = await Promise.all([
    getProfileStats(me),
    listMemberTools(me.id).catch(() => []),
    listMoim(me.id, 'mine', null, 100).catch(() => [] as Moim[]),
    listMoim(me.id, 'hosting', null, 100).catch(() => [] as Moim[]),
    listMyGroups(me.id, true).catch(() => []),
    listProfileAgents(me.id, me.id).catch(() => []),
    listMemberBadges(me.id).catch(() => []),
  ])
  const pledge = await getPledgeStatus(me).catch(() => null)
  const stats = await getDashboardStats(me, profile.likes, profile.posts).catch(() => ({ posts: profile.posts, comments: 0, likesReceived: profile.likes, likesGiven: 0 }))
  const moims = [...new Map([...moimHosting, ...moimMine].map((m) => [m.id, m])).values()].sort((a, b) => b.startsAt.localeCompare(a.startsAt))
  const agentActs = agents.reduce((s, a) => s + a.counts.agoraPosts + a.counts.agoraReplies + a.counts.feedReplies + a.counts.likes, 0)

  const mineArticles = await listMyArticles().catch(() => ({ articles: [], series: [] }))
  const counts: Record<DashboardTab, number> = {
    posts: stats.posts,
    articles: mineArticles.articles.length,
    comments: stats.comments,
    likes: stats.likesGiven,
    tools: tools.length,
    moim: moims.length,
    groups: groups.length,
    agents: agentActs,
  }

  const summary: Array<{ label: string; value: number | string; tab?: DashboardTab; href?: string }> = [
    { label: st('게시물'), value: stats.posts, tab: 'posts' },
    { label: st('아티클'), value: mineArticles.articles.length, tab: 'articles' },
    { label: st('댓글'), value: stats.comments, tab: 'comments' },
    { label: st('받은 좋아요'), value: stats.likesReceived, tab: 'posts' },
    { label: st('쓰는 것'), value: tools.length, tab: 'tools' },
    { label: st('모임'), value: moims.length, tab: 'moim' },
    { label: st('그룹'), value: groups.length, tab: 'groups' },
    { label: st('AI 활동'), value: agentActs, tab: 'agents' },
    { label: st('남은 초대'), value: profile.invitesLeft, href: '/invites' },
  ]

  let body: ReactNode = null
  const listKey = dashboardHref(tab)
  async function more(p: number) {
    'use server'
    const s = await getUserState()
    if (s.type !== 'member') return { nodes: null, hasMore: false }
    const r = await dashboardListChunk(s.member.id, tab, p)
    return { nodes: r.nodes, hasMore: p < r.totalPages }
  }
  const infinite = (c: { nodes: ReactNode; totalPages: number }) => (
    <InfiniteList key={listKey} hasMore={c.totalPages > 1} load={more} storageKey={listKey}>
      {c.nodes}
    </InfiniteList>
  )
  if (tab === 'posts' || tab === 'articles' || tab === 'comments' || tab === 'likes' || tab === 'tools' || tab === 'moim' || tab === 'groups') {
    body = infinite(await dashboardListChunk(me.id, tab, 1))
  } else if (tab === 'agents') {
    // A79 P5: activity only — managing agents lives on /agents, each agent links to /agents/{id}
    const feed = agentActivityFeed(agents)
    body = feed.length ? (
      <ul className="divide-y divide-n-f0f0f0">
        {feed.map(({ key, agent, item }) => (
          <li key={key} className="px-4 py-3 min-w-0">
            <div className="flex items-center gap-2 min-w-0 text-xs text-n-888">
              <Link href={agent.href} className="inline-flex items-center gap-1.5 min-w-0 font-semibold text-n-111">
                <AgentAvatar name={agent.name} brand={agent.brand} avatarUrl={agent.avatarUrl} size={20} />
                <span className="truncate">{agent.name}</span>
              </Link>
              <span className="shrink-0">· <T>{AGENT_ACT_LABEL[item.kind]}</T></span>
              <span className="ml-auto shrink-0"><RelativeTime date={item.createdAt} /></span>
            </div>
            <Link href={item.href} className="mt-1 clamp-2 text-[13.5px] text-n-333 hover:text-n-111">
              {item.snippet}
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      <Empty>
        {agents.length ? <T>아직 내 에이전트의 활동이 없어요.</T> : <T>연결한 AI가 없어요.</T>}{' '}
        <Link href="/agents" className="text-link">{agents.length ? <T>내 에이전트</T> : <T>에이전트 연결</T>}</Link>
      </Empty>
    )
  }

  return (
    <div className="space-y-3 dashboard-page">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold flex-1 min-w-0" style={{ color: 'var(--n-111)' }}>
          <T>내 대시보드</T>
        </h1>
        {/* A79 P2: the profile (and editing it in place) lives on /members/me; this page is activity only */}
        <Link href="/members/me" className="text-[13px] text-link">
          <T>내 프로필 · 편집</T>
        </Link>
        <Link href="/settings" className="btn btn-secondary btn-sm min-h-[36px] min-w-[36px] rounded-full !px-0 justify-center" aria-label={st('설정')}>
          <Settings className="w-[18px] h-[18px]" />
        </Link>
      </div>
      <section className="card overflow-hidden">
        <div className="px-4 pt-3 pb-3 empty:hidden">
          {pledge?.signedAt && (
            <Link href="/pledge" className="pledge-chip" title={t('내가 서명한 선언 및 입단 서약 보기')}>
              <ScrollText className="w-3.5 h-3.5" />
              <T s="{date} 입단 서약" vars={{ date: new Intl.DateTimeFormat(LOCALE_META[locale].intl, { dateStyle: 'medium', timeZone: 'Asia/Seoul' }).format(new Date(pledge.signedAt)) }} />
              <span className="text-n-888">
                <T s="· 초대인 {name}" vars={{ name: pledge.inviter ?? t('창립 멤버') }} />
              </span>
              {pledge.hash && (
                <code className="pr-mono text-[11px] text-n-555" title={pledge.hash}>
                  {recordNo(pledge.no)} · {shortHash(pledge.hash, 6, 4)}
                </code>
              )}
            </Link>
          )}
          {badges.length > 0 && (
            <div className={pledge?.signedAt ? 'mt-2.5' : undefined}>
              <BadgeChips badges={badges} isMe />
            </div>
          )}
        </div>
        <dl className="dash-stats grid grid-cols-4 border-t border-n-f0f0f0">
          {summary.map((s) => (
            <Link key={s.label} href={s.href ?? dashboardHref(s.tab ?? 'posts')} scroll={s.href ? undefined : false} className="px-2 py-3 text-center hover:bg-n-fafafa">
              <dd className="text-lg font-bold text-n-111 tabular-nums">{s.value}</dd>
              <dt className="text-[11.5px] text-n-888"><T>{s.label}</T></dt>
            </Link>
          ))}
        </dl>
      </section>

      <section className="card overflow-hidden">
        <LinkTabs label={msg('대시보드 탭')} active={tab} tabs={TAB_IDS.map((id) => ({ id, label: DASHBOARD_TABS.find((t) => t.id === id)!.label, href: dashboardHref(id), count: counts[id] }))} />
        {body}
      </section>
    </div>
  )
}
