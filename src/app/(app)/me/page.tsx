import Link from 'next/link'
import { ChipBar } from '@/components/chip-bar'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { Bot, Heart, MessageCircle, Pencil, ScrollText, Settings } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { getProfileStats } from '@/lib/data/shell'
import { getPledgeStatus } from '@/lib/data/pledge'
import { recordNo, shortHash } from '@/lib/pledge-record'
import { getDashboardStats, listMyComments, listMyLikedPosts, type DashItem } from '@/lib/data/dashboard'
import { listFeedPage } from '@/lib/data/feed'
import { listMemberTools } from '@/lib/data/tools'
import { listMoim, type Moim } from '@/lib/data/moim'
import { listMyGroups } from '@/lib/data/groups'
import { listProfileAgents } from '@/lib/data/tokens'
import { listMyInviteCodes } from '@/lib/data/invites'
import { DASHBOARD_TABS, dashboardHref, NETWORK_VIEWS, networkHref, pageSlice, parseDashboardTab, parseNetworkView, type DashboardTab } from '@/lib/dashboard-tabs'
import { getSocialSummary, listSocial, type SocialListKind } from '@/lib/data/social'
import { getInviteGraph, GRAPH_HOPS } from '@/lib/data/graph'
import { InviteGraph } from '@/components/network/invite-graph'
import { PersonRow } from '@/components/social/person-row'
import { parsePage, PAGE_SIZE } from '@/lib/paging'
import { toolHref, TOOL_TYPE_CHIP } from '@/lib/tool-rules'
import { RSVP_LABEL } from '@/lib/moim-rules'
import { ROLE_LABEL } from '@/lib/group-rules'
import { LinkTabs } from '@/components/link-tabs'
import { Pagination } from '@/components/pagination'
import { RelativeTime } from '@/components/relative-time'
import { UserAvatar } from '@/components/user-avatar'
import { ToolIcon } from '@/components/tools/tool-card'
import { T } from '@/i18n/t'
import { getLocale, getT } from '@/i18n/server'
import { LOCALE_META } from '@/i18n/config'
import { msg } from '@/i18n/translate'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('내 대시보드 · AI쓰발') }
}

const TAB_IDS = DASHBOARD_TABS.map((t) => t.id)

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-[#888]">{children}</p>
}

function Row({ href, children, meta }: { href: string; children: ReactNode; meta?: ReactNode }) {
  return (
    <li>
      <Link href={href} className="dash-row block px-4 py-3 hover:bg-[#fafafa]">
        <div className="text-[14.5px] text-[#222] line-clamp-2 break-words">{children}</div>
        {meta && <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[#888]">{meta}</div>}
      </Link>
    </li>
  )
}

function PostRows({ items, empty }: { items: DashItem[]; empty: string }) {
  if (!items.length) return <Empty><T>{empty}</T></Empty>
  return (
    <ul className="divide-y divide-[#f0f0f0]">
      {items.map((p) => (
        <Row
          key={p.id}
          href={p.href}
          meta={
            <>
              {p.authorName && <span className="text-[#555]">{p.authorName}</span>}
              {p.isNickname && <span className="badge"><T>부캐</T></span>}
              <RelativeTime date={p.createdAt} />
              <span className="inline-flex items-center gap-0.5"><Heart className="w-3 h-3" /> {p.likeCount}</span>
              {p.replyCount > 0 && <span className="inline-flex items-center gap-0.5"><MessageCircle className="w-3 h-3" /> {p.replyCount}</span>}
            </>
          }
        >
          {p.title && <b className="text-[#111]">{p.title} </b>}
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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string; view?: string; root?: string }> }) {
  const st = await getT()
  const t = await getT()
  const locale = await getLocale()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const me = state.member
  const sp = await searchParams
  const tab = parseDashboardTab(sp.tab)
  const page = parsePage(sp.page)

  const [profile, tools, moimMine, moimHosting, groups, agents, invites, social] = await Promise.all([
    getProfileStats(me),
    listMemberTools(me.id).catch(() => []),
    listMoim(me.id, 'mine', null, 100).catch(() => [] as Moim[]),
    listMoim(me.id, 'hosting', null, 100).catch(() => [] as Moim[]),
    listMyGroups(me.id, true).catch(() => []),
    listProfileAgents(me.id, me.id).catch(() => []),
    listMyInviteCodes(me.id, Boolean(me.signup_completed_at)).catch(() => null),
    getSocialSummary(me.id, me.id).catch(() => null),
  ])
  const pledge = await getPledgeStatus(me).catch(() => null)
  const stats = await getDashboardStats(me, profile.likes, profile.posts).catch(() => ({ posts: profile.posts, comments: 0, likesReceived: profile.likes, likesGiven: 0 }))
  const moims = [...new Map([...moimHosting, ...moimMine].map((m) => [m.id, m])).values()].sort((a, b) => b.startsAt.localeCompare(a.startsAt))
  const codes = invites?.codes ?? []
  const used = codes.filter((c) => c.isUsed).length
  const agentActs = agents.reduce((s, a) => s + a.counts.agoraPosts + a.counts.agoraReplies + a.counts.feedReplies + a.counts.likes, 0)

  const counts: Record<DashboardTab, number> = {
    posts: stats.posts,
    comments: stats.comments,
    likes: stats.likesGiven,
    tools: tools.length,
    moim: moims.length,
    groups: groups.length,
    agents: agents.length,
    invites: codes.length,
    network: social ? social.followers + social.following : 0,
  }

  const summary: Array<{ label: string; value: number | string; tab: DashboardTab }> = [
    { label: st('게시물'), value: stats.posts, tab: 'posts' },
    { label: st('댓글'), value: stats.comments, tab: 'comments' },
    { label: st('받은 좋아요'), value: stats.likesReceived, tab: 'posts' },
    { label: st('쓰는 툴'), value: tools.length, tab: 'tools' },
    { label: st('모임'), value: moims.length, tab: 'moim' },
    { label: st('그룹'), value: groups.length, tab: 'groups' },
    { label: st('AI 활동'), value: agentActs, tab: 'agents' },
    { label: st('남은 초대'), value: profile.invitesLeft, tab: 'invites' },
  ]

  let body: ReactNode = null
  let totalPages = 1
  if (tab === 'posts') {
    const r = await listFeedPage(me.id, { authorId: me.id, includeNickname: true, page })
    totalPages = r.totalPages
    body = (
      <PostRows
        empty={t('아직 쓴 글이 없어요.')}
        items={r.posts.map((p) => ({
          id: p.id,
          href: `/posts/${p.id}`,
          title: p.title ?? null,
          body: p.body || p.linkPreview?.title || p.linkUrl || '',
          createdAt: p.createdAt,
          likeCount: p.likeCount,
          replyCount: p.replyCount,
          isNickname: Boolean(p.isNickname),
        }))}
      />
    )
  } else if (tab === 'comments') {
    const r = await listMyComments(me.id, page).catch(() => ({ items: [], totalPages: 1 }))
    totalPages = r.totalPages
    body = <PostRows items={r.items} empty={msg('아직 남긴 댓글이 없어요.')} />
  } else if (tab === 'likes') {
    const r = await listMyLikedPosts(me.id, page).catch(() => ({ items: [], totalPages: 1 }))
    totalPages = r.totalPages
    body = <PostRows items={r.items} empty={msg('아직 좋아요한 글이 없어요.')} />
  } else if (tab === 'tools') {
    const s = pageSlice(tools, page, PAGE_SIZE)
    totalPages = s.totalPages
    body = s.items.length ? (
      <ul className="divide-y divide-[#f0f0f0]">
        {s.items.map((t) => (
          <li key={t.id}>
            <Link href={toolHref(t)} className="flex items-center gap-3 px-4 py-3 hover:bg-[#fafafa]">
              <ToolIcon name={t.name} iconUrl={t.icon_url} dim="w-9 h-9" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-[#111] truncate">{t.name}</span>
                <span className="block text-xs text-[#888] truncate">{t.one_liner}</span>
              </span>
              <span className="badge"><T>{TOOL_TYPE_CHIP[t.type] ?? t.type}</T></span>
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      <Empty>
        <T>아직 ‘쓰는 중’으로 표시한 툴이 없어요.</T> <Link href="/tools" className="text-[#0066cc]"><T>툴 둘러보기</T></Link>
      </Empty>
    )
  } else if (tab === 'moim') {
    const s = pageSlice(moims, page, PAGE_SIZE)
    totalPages = s.totalPages
    body = s.items.length ? (
      <ul className="divide-y divide-[#f0f0f0]">
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
                {m.status === 'cancelled' && <span className="text-[#e5484d]"><T>취소됨</T></span>}
              </>
            }
          >
            <b className="text-[#111]">{m.title}</b>
          </Row>
        ))}
      </ul>
    ) : (
      <Empty>
        <T>신청했거나 주최한 모임이 없어요.</T> <Link href="/moim" className="text-[#0066cc]"><T>모임 보기</T></Link>
      </Empty>
    )
  } else if (tab === 'groups') {
    const s = pageSlice(groups, page, PAGE_SIZE)
    totalPages = s.totalPages
    body = s.items.length ? (
      <ul className="divide-y divide-[#f0f0f0]">
        {s.items.map((g) => (
          <li key={g.id}>
            <Link href={`/groups/${g.slug}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[#fafafa]">
              <span className="w-9 h-9 rounded-xl bg-[#f3f3f3] inline-flex items-center justify-center text-lg" aria-hidden>
                {g.emoji || '👥'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-[#111] truncate">{g.name}</span>
                <span className="block text-xs text-[#888]"><T s="멤버 {memberCount} · 글 {postCount}" vars={{ memberCount: g.memberCount, postCount: g.postCount }} /></span>
              </span>
              <span className="badge">{g.myStatus === 'pending' ? <T>가입 요청 중</T> : g.myStatus === 'invited' ? <T>초대받음</T> : g.myRole ? ROLE_LABEL[g.myRole] : <T>멤버</T>}</span>
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      <Empty>
        <T>가입한 그룹이 없어요.</T> <Link href="/groups" className="text-[#0066cc]"><T>그룹 둘러보기</T></Link>
      </Empty>
    )
  } else if (tab === 'agents') {
    body = agents.length ? (
      <ul className="divide-y divide-[#f0f0f0]">
        {agents.map((a) => (
          <li key={a.id} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#555]" />
              <b className="text-[#111]">{a.agentName}</b>
              {a.agentModel && <span className="text-xs text-[#888] truncate">{a.agentModel}</span>}
              <span className="ml-auto text-xs text-[#888]">{a.lastUsedAt ? <><T>최근</T> <RelativeTime date={a.lastUsedAt} /></> : <T>아직 사용 안 함</T>}</span>
            </div>
            <div className="mt-1 text-xs text-[#666]"><T s="아고라 글 {agoraPosts} · 아고라 답글 {agoraReplies} · 피드 답글 {feedReplies} · 좋아요 {likes}" vars={{ agoraPosts: a.counts.agoraPosts, agoraReplies: a.counts.agoraReplies, feedReplies: a.counts.feedReplies, likes: a.counts.likes }} /></div>
            {a.recent.length > 0 && (
              <ul className="mt-2 space-y-1">
                {a.recent.slice(0, 3).map((r) => (
                  <li key={r.id}>
                    <Link href={r.href} className="block text-[13px] text-[#444] line-clamp-1 hover:underline">
                      {r.snippet}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    ) : (
      <Empty>
        <T>연결한 AI가 없어요.</T> <Link href="/connect" className="text-[#0066cc]"><T>AI 연결하기</T></Link>
      </Empty>
    )
  } else if (tab === 'network') {
    const view = parseNetworkView(sp.view)
    const socialCounts: Partial<Record<string, number>> = {
      followers: social?.followers,
      following: social?.following,
      friends: social?.friends,
      requests: social?.incomingRequests ?? undefined,
    }
    let inner: ReactNode
    if (view === 'graph') {
      const root = sp.root || null
      const graph = await getInviteGraph(me.id, root).catch(() => null)
      const center = graph?.nodes.find((n) => n.id === graph.rootId)
      inner = (
        <div className="p-3 space-y-2">
          <p className="text-[13px] px-1" style={{ color: '#666' }}><T s="{v} {GRAPH_HOPS}단계까지 보여요. 점선 +N을 누르면 더 불러와요. 드래그로 이동, 휠·핀치로 확대." vars={{ v: center && !center.relation.isMe ? st('{name}님 중심', { name: center.name }) : st('나를 중심으로'), GRAPH_HOPS }} /></p>
          {graph ? <InviteGraph key={graph.rootId} initial={graph} /> : <Empty><T>네트워크를 불러오지 못했어요.</T></Empty>}
        </div>
      )
    } else {
      const kind = view as SocialListKind
      const people = await listSocial(me.id, me.id, kind).catch(() => [])
      const s = pageSlice(people, page, PAGE_SIZE)
      totalPages = s.totalPages
      inner = s.items.length ? (
        <ul className="divide-y divide-[#f0f0f0]">
          {s.items.map((p) => (
            <li key={p.id}>
              <PersonRow person={p} showFriend={kind === 'requests' || kind === 'sent' || kind === 'friends'} />
            </li>
          ))}
        </ul>
      ) : (
        <Empty>
          {{ followers: st('아직 팔로워가 없어요.'), following: st('아직 팔로우한 사람이 없어요.'), friends: st('아직 친구가 없어요. 친구는 친구 신청 → 수락으로 생겨요 (맞팔과 별개).'), requests: st('받은 친구 요청이 없어요.'), sent: <T>보낸 친구 요청이 없어요.</T> }[kind]}
        </Empty>
      )
    }
    body = (
      <div>
        <ChipBar as="div" role="tablist" label={st('네트워크 보기')} className="px-3 pt-3 pb-1">
          {NETWORK_VIEWS.map((v) => (
            <Link
              key={v.id}
              href={networkHref({ view: v.id })}
              scroll={false}
              role="tab"
              aria-selected={v.id === view}
              className={`filter-chip whitespace-nowrap ${v.id === view ? 'on' : ''}`}
            >
              <T>{v.label}</T>
              {typeof socialCounts[v.id] === 'number' && <span className="ml-1 tabular-nums opacity-70">{socialCounts[v.id]}</span>}
              {v.id === 'requests' && (social?.incomingRequests ?? 0) > 0 && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-[#e5484d]" aria-label={st('새 요청')} />}
            </Link>
          ))}
        </ChipBar>
        {inner}
      </div>
    )
  } else if (tab === 'invites') {
    body = (
      <div>
        <p className="px-4 pt-3 text-sm text-[#555]">
          <T s="초대 코드 {codes}개 중 {used}명이 가입했어요 · 남은 초대 {left}" vars={{ codes: codes.length, used: <b className="text-[#111]">{used}</b>, left: profile.invitesLeft }} />
        </p>
        {codes.length ? (
          <ul className="divide-y divide-[#f0f0f0] mt-2">
            {codes.map((c) => (
              <li key={c.code} className="flex items-center gap-3 px-4 py-3">
                <code className="font-mono text-[13px] text-[#111]">{c.code}</code>
                <span className="ml-auto text-xs text-[#888]">
                  {c.isUsed ? (
                    <>
                      {c.usedBy?.displayName ?? <T>가입 완료</T>} {c.usedAt && <>· <RelativeTime date={c.usedAt} /></>}
                    </>
                  ) : c.isActive ? (
                    <T>사용 가능</T>
                  ) : (
                    <T>비활성</T>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty><T>초대 코드가 없어요.</T></Empty>
        )}
        <div className="px-4 pb-3">
          <Link href="/invites" className="text-sm text-[#0066cc]">
            <T>초대 관리로 이동 →</T>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 dashboard-page">
      <section className="card overflow-hidden">
        <div className="profile-card-cover h-16" aria-hidden />
        <div className="px-4 pb-4 -mt-7 flex items-end justify-between gap-3">
          <span className="rounded-full ring-4 ring-white">
            <UserAvatar id={me.id} name={me.display_name} avatarUrl={me.avatar_url} size="lg" />
          </span>
          <div className="flex items-center gap-2">
            <Link href="/settings/profile" className="btn btn-secondary btn-sm min-h-[40px] rounded-full inline-flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5" /> <T>프로필 편집</T>
            </Link>
            <Link href="/settings" className="btn btn-secondary btn-sm min-h-[40px] min-w-[40px] rounded-full !px-0 justify-center" aria-label={st('설정')}>
              <Settings className="w-[18px] h-[18px]" />
            </Link>
          </div>
        </div>
        <div className="px-4 pb-3">
          <h1 className="text-xl font-bold" style={{ color: '#111' }}>
            <T>내 대시보드</T>
          </h1>
          <div className="text-sm text-[#777]">
            {me.display_name}
            {me.handle && <> · @{me.handle}</>} ·{' '}
            <Link href="/members/me" className="text-[#0066cc]">
              <T>공개 프로필 보기</T>
            </Link>
          </div>
          {pledge?.signedAt && (
            <Link href="/pledge" className="pledge-chip mt-2" title={t('내가 서명한 선언 및 입단 서약 보기')}>
              <ScrollText className="w-3.5 h-3.5" />
              <T s="{date} 입단 서약" vars={{ date: new Intl.DateTimeFormat(LOCALE_META[locale].intl, { dateStyle: 'medium', timeZone: 'Asia/Seoul' }).format(new Date(pledge.signedAt)) }} />
              <span className="text-[#888]">
                <T s="· 초대인 {name}" vars={{ name: pledge.inviter ?? t('창립 멤버') }} />
              </span>
              {pledge.hash && (
                <code className="pr-mono text-[11px] text-[#555]" title={pledge.hash}>
                  {recordNo(pledge.no)} · {shortHash(pledge.hash, 6, 4)}
                </code>
              )}
            </Link>
          )}
        </div>
        <dl className="dash-stats grid grid-cols-4 border-t border-[#f0f0f0]">
          {summary.map((s) => (
            <Link key={s.label} href={dashboardHref(s.tab)} scroll={false} className="px-2 py-3 text-center hover:bg-[#fafafa]">
              <dd className="text-lg font-bold text-[#111] tabular-nums">{s.value}</dd>
              <dt className="text-[11.5px] text-[#888]"><T>{s.label}</T></dt>
            </Link>
          ))}
        </dl>
      </section>

      <section className="card overflow-hidden">
        <LinkTabs label={msg('대시보드 탭')} active={tab} tabs={TAB_IDS.map((id) => ({ id, label: DASHBOARD_TABS.find((t) => t.id === id)!.label, href: dashboardHref(id), count: counts[id] }))} />
        {body}
        <Pagination base={tab === 'network' ? networkHref({ view: parseNetworkView(sp.view) }) : dashboardHref(tab)} page={page} totalPages={totalPages} />
      </section>
    </div>
  )
}
