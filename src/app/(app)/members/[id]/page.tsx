import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronRight, Network, Settings, Wrench } from 'lucide-react'
import { getSocialSummary } from '@/lib/data/social'
import { FollowButton } from '@/components/social/follow-button'
import { FriendButton } from '@/components/social/friend-button'
import { RelationBadge } from '@/components/social/relation-badge'
import { getUserState } from '@/lib/auth'
import { getMemberById } from '@/lib/data/members'
import { listFeedPage } from '@/lib/data/feed'
import { InfiniteList } from '@/components/infinite/infinite-list'
import { networkHref } from '@/lib/dashboard-tabs'
import { getProfileStats } from '@/lib/data/shell'
import { isFeedId } from '@/lib/feed-ids'
import { UserAvatar } from '@/components/user-avatar'
import { PostCard } from '@/components/timeline/post-card'
import { ToolIcon } from '@/components/tools/tool-icon'
import { getUsageVisibility, listMemberTools } from '@/lib/data/tools'
import { UsageVisibility } from '@/components/tools/usage-visibility'
import { BadgeChips } from '@/components/profile/badge-chips'
import { listMemberBadges } from '@/lib/data/badges'
import { TOOL_TYPE_CHIP, toolHref } from '@/lib/tool-rules'
import { getProfileLinks } from '@/lib/data/profile'
import { LINK_KINDS, LINK_VISIBILITY } from '@/lib/profile-rules'
import { LinkIcon } from '@/components/profile/link-icon'
import { AgentsSection } from '@/components/profile/agents-section'
import { listProfileAgents } from '@/lib/data/tokens'
import { getProfileStack } from '@/lib/data/profile-stack'
import { AgentList, StackChips } from '@/components/profile/member-card'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('프로필 · AI쓰발') }
}

export default async function MemberProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ badges?: string }> }) {
  const st = await getT()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const viewer = state.member
  const { id: rawId } = await params
  const id = rawId === 'me' ? viewer.id : rawId
  if (id !== viewer.id && !isFeedId(id)) notFound()
  const isMe = id === viewer.id

  const member = isMe ? viewer : await getMemberById(id)
  if (!member || !member.signup_completed_at) notFound()

  // Other members' pages only list real-name posts: nickname posts stay unlinkable.
  const [{ posts, totalPages }, stats, tools, social, agents, stack, badges] = await Promise.all([
    listFeedPage(viewer.id, { authorId: member.id, includeNickname: isMe, page: 1 }),
    isMe ? getProfileStats(viewer) : Promise.resolve(null),
    listMemberTools(member.id).catch(() => []),
    getSocialSummary(viewer.id, member.id).catch(() => null),
    listProfileAgents(viewer.id, member.id).catch(() => []),
    getProfileStack(viewer.id, member.id).catch(() => null),
    listMemberBadges(member.id).catch(() => []),
  ])
  const openBadge = (await searchParams).badges?.slice(0, 20) ?? null
  const usageVis = isMe ? await getUsageVisibility().catch(() => 'members' as const) : 'members'
  const authorId = member.id
  async function more(page: number) {
    'use server'
    const st = await getUserState()
    if (st.type !== 'member') return { nodes: null, hasMore: false }
    const r = await listFeedPage(st.member.id, { authorId, includeNickname: st.member.id === authorId, page })
    return { nodes: r.posts.length ? <ProfilePosts posts={r.posts} /> : null, hasMore: page < r.totalPages }
  }
  const stackShown = stack && ((['ai', 'subs', 'skills'] as const).some((g) => (stack[g]?.items.length ?? 0) > 0) || stack.agents.length > 0)
  // SNS links: filtered server-side by each link's visibility (전체 회원 / 친구만 / 비공개).
  const links = await getProfileLinks(viewer.id, member.id, social?.relation.friend === 'friends').catch(() => [])
  const socialHref = (tab: string) => `/members/${isMe ? 'me' : member.id}/social?tab=${tab}`

  return (
    <div className="space-y-3">
      <section className="card overflow-hidden">
        <div className="profile-card-cover h-20" aria-hidden />
        <div className="px-4 pb-4 -mt-8 flex items-end justify-between gap-3">
          <span className="rounded-full ring-4 ring-n-fff">
            <UserAvatar id={member.id} name={member.display_name} avatarUrl={member.avatar_url} size="lg" />
          </span>
          {!isMe && social && (
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <FollowButton memberId={member.id} initialFollowing={social.relation.iFollow} />
              <FriendButton memberId={member.id} initialState={social.relation.friend} />
            </div>
          )}
          {isMe && (
            <div className="flex items-center gap-2">
              <Link href="/settings/profile" className="btn btn-secondary btn-sm min-h-[40px] rounded-full">
                <T>프로필 편집</T>
              </Link>
              <Link href="/settings" className="btn btn-secondary btn-sm min-h-[40px] min-w-[40px] rounded-full !px-0 justify-center" aria-label={st('설정')}>
                <Settings className="w-[18px] h-[18px]" />
              </Link>
            </div>
          )}
        </div>
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-n-111">{member.display_name}</h1>
            {social && <RelationBadge relation={social.relation} />}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-n-777">
            {member.handle && <span className="font-medium">@{member.handle}</span>}
            {member.show_real_name && member.public_real_name && <span><T s="· 실명 {public_real_name}" vars={{ public_real_name: member.public_real_name }} /></span>}
            {isMe && !member.show_real_name && <span className="text-n-aaa"><T>· 실명 비공개</T></span>}
          </div>
          {member.bio && <p className="text-sm text-n-555 mt-2 whitespace-pre-wrap">{member.bio}</p>}
          {links.length > 0 && (
            <ul className="profile-links flex flex-wrap gap-1.5 mt-3" aria-label={st('SNS 링크')}>
              {links.map((l, i) => {
                const label = LINK_KINDS.find((k) => k.kind === l.kind)?.label ?? l.kind
                return (
                  <li key={i}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer nofollow me" className="inline-flex items-center gap-1.5 rounded-full pl-1 pr-3 min-h-[36px] text-[13px] hover:bg-n-f2f2f2" style={{ border: '1px solid var(--n-eee)', color: 'var(--n-222)' }} title={l.url}>
                      <LinkIcon kind={l.kind} size={26} />
                      <T>{label}</T>
                      {isMe && l.visibility !== 'members' && <span className="text-[11px] text-n-999">· <T>{LINK_VISIBILITY.find((v) => v.id === l.visibility)?.label ?? ''}</T></span>}
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
          {badges.length > 0 && (
            <div className="mt-3">
              <BadgeChips badges={badges} isMe={isMe} initialOpen={openBadge} />
            </div>
          )}
          {social && (
            <div className="profile-social flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm">
              <Link href={socialHref('followers')} className="min-h-[32px] inline-flex items-center gap-1">
                <b className="text-n-111 tabular-nums">{social.followers}</b> <span className="text-n-777"><T>팔로워</T></span>
              </Link>
              <Link href={socialHref('following')} className="min-h-[32px] inline-flex items-center gap-1">
                <b className="text-n-111 tabular-nums">{social.following}</b> <span className="text-n-777"><T>팔로잉</T></span>
              </Link>
              <Link href={socialHref('friends')} className="min-h-[32px] inline-flex items-center gap-1">
                <b className="text-n-111 tabular-nums">{social.friends}</b> <span className="text-n-777"><T>친구</T></span>
              </Link>
              {isMe && (social.incomingRequests ?? 0) > 0 && (
                <Link href={socialHref('requests')} className="min-h-[32px] inline-flex items-center gap-1 text-c-e5484d font-medium"><T s="친구 요청 {incomingRequests}" vars={{ incomingRequests: social.incomingRequests }} /></Link>
              )}
              <Link href={isMe ? networkHref() : networkHref({ root: member.id })} className="min-h-[32px] inline-flex items-center gap-1 text-link">
                <Network className="w-3.5 h-3.5" /> <T>초대 네트워크</T>
              </Link>
            </div>
          )}
          {stats && (
            <div className="flex gap-5 mt-2 text-sm">
              <span><b className="text-n-111">{stats.posts}</b> <span className="text-n-777"><T>게시물</T></span></span>
              <span><b className="text-n-111">{stats.likes}</b> <span className="text-n-777"><T>받은 좋아요</T></span></span>
              <Link href="/invites"><b className="text-n-111">{stats.invitesLeft}</b> <span className="text-n-777"><T>남은 초대</T></span></Link>
            </div>
          )}
        </div>
      </section>

      {(stackShown || isMe) && (
        <section id="stack" className="card p-4 scroll-mt-20" aria-labelledby="stack-title">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 id="stack-title" className="text-sm font-semibold text-n-111">
              {isMe ? <T>내 AI 스택</T> : <T s="{name}님의 AI 스택" vars={{ name: member.display_name }} />}
            </h2>
            {isMe && (
              <Link href="/settings/profile#stack" className="text-xs text-link inline-flex items-center min-h-[32px]">
                <T>편집</T> <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
          {stackShown && stack ? (
            <div className="flex flex-col gap-3">
              <StackChips group="ai" data={stack.ai} max={40} />
              <StackChips group="subs" data={stack.subs} max={40} />
              <StackChips group="skills" data={stack.skills} max={40} />
              <AgentList agents={stack.agents} isMe={isMe} max={40} title={isMe ? st('내 에이전트') : st('에이전트')} />
            </div>
          ) : (
            <p className="text-sm text-n-888">
              <T s="쓰는 AI, 구독 중인 서비스, 에이전트를 {edit}에서 추가해 보세요." vars={{ edit: <Link href="/settings/profile#stack" className="text-link"><T>프로필 편집</T></Link> }} />
            </p>
          )}
        </section>
      )}

      <section className="card p-4" aria-labelledby="my-tools">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 id="my-tools" className="text-sm font-semibold text-n-111 inline-flex items-center gap-1.5">
            <Wrench className="w-4 h-4" /> {isMe ? <T>내가 쓰는 것</T> : <T s="{name}님이 쓰는 것" vars={{ name: member.display_name }} />}
            <span className="text-n-888 font-normal tabular-nums">{tools.length}</span>
          </h2>
          {isMe && (
            <div className="flex items-center gap-2">
              <UsageVisibility initial={usageVis} />
              <Link href="/gallery?view=mine" className="text-xs text-link inline-flex items-center min-h-[32px]">
                <T>관리</T> <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>
        {tools.length === 0 ? (
          <p className="text-sm text-n-888">
            {isMe ? (
              <>
                <T s="아직 없어요. {tools}에서 ‘나도 써요’를 눌러 모아보세요." vars={{ tools: <Link href="/gallery" className="text-link"><T>갤러리</T></Link> }} />
              </>
            ) : (
              <T>아직 표시한 게 없어요.</T>
            )}
          </p>
        ) : (
          <ul className="profile-tools" style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 150px), 1fr))' }}>
            {tools.map((t) => (
              <li key={t.id} className="min-w-0">
                <Link href={toolHref(t)} className="profile-tool min-w-0">
                  <ToolIcon name={t.name} iconUrl={t.icon_url} dim="w-9 h-9" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-n-111 truncate">{t.name}</span>
                    <span className="block text-[11.5px] text-n-888 truncate">
                      <T>{TOOL_TYPE_CHIP[t.type]}</T>
                      {(t.user_count ?? 0) > 1 ? <> · <T s="{n}명이 써요" vars={{ n: t.user_count ?? 0 }} /></> : ''}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AgentsSection agents={agents} isMe={isMe} ownerName={member.display_name} />

      <h2 className="text-sm font-semibold text-n-111 px-1">{isMe ? <T>내 글</T> : <T>글</T>}</h2>
      {posts.length === 0 ? (
        <div className="card p-8 text-center text-sm text-n-888"><T>아직 글이 없어요.</T></div>
      ) : (
        <InfiniteList key={member.id} className="inf-cards" hasMore={totalPages > 1} load={more} storageKey={`/members/${member.id}`}>
          <ProfilePosts posts={posts} />
        </InfiniteList>
      )}
    </div>
  )
}

function ProfilePosts({ posts }: { posts: Awaited<ReturnType<typeof listFeedPage>>['posts'] }) {
  return (
    <div className="timeline-list">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} href={`/posts/${p.id}`} replyHref={`/posts/${p.id}`} likeEndpoint={`/api/feed/${p.id}/like`} likersEndpoint={`/api/feed/${p.id}/likers`} />
      ))}
    </div>
  )
}
