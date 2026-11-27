import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CalendarDays, ChevronRight, Network, Pencil, Plus, Rocket, Settings, Wrench } from 'lucide-react'
import { getSocialSummary } from '@/lib/data/social'
import { FollowButton } from '@/components/social/follow-button'
import { FriendButton } from '@/components/social/friend-button'
import { RelationBadge } from '@/components/social/relation-badge'
import { getUserState } from '@/lib/auth'
import { getMemberById } from '@/lib/data/members'
import { listFeedPage } from '@/lib/data/feed'
import { listAuthorArticles } from '@/lib/data/articles'
import { ArticleCardView, SeriesCardView } from '@/components/articles/article-card'
import { InfiniteList } from '@/components/infinite/infinite-list'
import { networkHref } from '@/lib/dashboard-tabs'
import { getProfileStats } from '@/lib/data/shell'
import { isFeedId } from '@/lib/feed-ids'
import { UserAvatar } from '@/components/user-avatar'
import { PostCard } from '@/components/timeline/post-card'
import { MyToolsList } from '@/components/profile/my-tools-list'
import { getUsageVisibility, listMemberMade, listMemberTools } from '@/lib/data/tools'
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
import { StackChips } from '@/components/profile/member-card'
import { ProfileEmpty, ProfileSection } from '@/components/profile/profile-section'
import { ProfileShareButton } from '@/components/profile/profile-share-button'
import { ToolIcon } from '@/components/tools/tool-icon'
import { listMoim } from '@/lib/data/moim'
import { SKILL_TYPES } from '@/lib/profile-stack'
import { hostedMoim } from '@/lib/profile-view'
import { LOCALE_META } from '@/i18n/config'
import { T } from '@/i18n/t'
import { ProfileCardEditor } from '@/components/profile/profile-card-editor'
import { loadProfileEditor } from '@/lib/data/profile-editor'
import { getLocale, getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('프로필 · AI쓰발') }
}

export default async function MemberProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ badges?: string; preview?: string; edit?: string; all?: string }> }) {
  const st = await getT()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/')
  if (state.type === 'waitlist') redirect('/waitlist')
  const viewer = state.member
  const { id: rawId } = await params
  const id = rawId === 'me' ? viewer.id : rawId
  if (id !== viewer.id && !isFeedId(id)) notFound()
  const isMe = id === viewer.id

  const member = isMe ? viewer : await getMemberById(id)
  if (!member || !member.signup_completed_at) notFound()

  const sp = await searchParams
  // A91: the owner sees the profile with pencils; ?edit=1 swaps the top card for the in-place editor,
  // ?preview=1 shows exactly what other members see (no owner tools)
  const owner = isMe && sp.preview !== '1'
  const editing = isMe && sp.edit === '1'
  const allPosts = sp.all === 'posts'

  // Other members' pages only list real-name posts: nickname posts stay unlinkable.
  const [{ posts, totalPages }, stats, tools, social, agents, stack, badges, made, moimUp, moimPast, inviter, authored] = await Promise.all([
    listFeedPage(viewer.id, { authorId: member.id, includeNickname: isMe, page: 1 }),
    isMe ? getProfileStats(viewer) : Promise.resolve(null),
    listMemberTools(member.id).catch(() => []),
    getSocialSummary(viewer.id, member.id).catch(() => null),
    listProfileAgents(viewer.id, member.id).catch(() => []),
    getProfileStack(viewer.id, member.id).catch(() => null),
    listMemberBadges(member.id).catch(() => []),
    listMemberMade(member.id).catch(() => []),
    listMoim(viewer.id, 'upcoming').catch(() => []),
    listMoim(viewer.id, 'past', null, 30).catch(() => []),
    member.invited_by_id ? getMemberById(member.invited_by_id).catch(() => null) : Promise.resolve(null),
    listAuthorArticles(member.id).catch(() => ({ articles: [], series: [] })),
  ])
  const openBadge = sp.badges?.slice(0, 20) ?? null
  const editor = editing ? await loadProfileEditor(viewer) : null
  const usageVis = isMe ? await getUsageVisibility().catch(() => 'members' as const) : 'members'
  const intl = LOCALE_META[await getLocale()].intl
  const authorId = member.id
  async function more(page: number) {
    'use server'
    const st = await getUserState()
    if (st.type !== 'member') return { nodes: null, hasMore: false }
    const r = await listFeedPage(st.member.id, { authorId, includeNickname: st.member.id === authorId, page })
    return { nodes: r.posts.length ? <ProfilePosts posts={r.posts} /> : null, hasMore: page < r.totalPages }
  }
  // SNS links: filtered server-side by each link's visibility (전체 회원 / 친구만 / 비공개).
  const links = await getProfileLinks(viewer.id, member.id, social?.relation.friend === 'friends').catch(() => [])
  const base = `/members/${isMe ? 'me' : member.id}`
  const socialHref = (tab: string) => `${base}/social?tab=${tab}`
  const editHref = (hash = '') => `/members/me?edit=1${hash}`

  // 내가 쓰는 것: chip rows (AI · 구독 · 스킬/MCP, A90 order) + gallery tools that aren't already a skill chip
  const stackGroups = (['ai', 'subs', 'skills'] as const).filter((g) => (stack?.[g]?.items.length ?? 0) > 0)
  const otherTools = tools.filter((t) => !SKILL_TYPES.includes(t.type))
  const usesEmpty = stackGroups.length === 0 && otherTools.length === 0
  // 모임: ones this member hosts under their real name (a 부캐-hosted moim must not point here)
  const hosted = hostedMoim(moimUp, moimPast, member.id)
  const joined = new Intl.DateTimeFormat(intl, { year: 'numeric', month: 'long', timeZone: 'Asia/Seoul' }).format(new Date(member.signup_completed_at))
  const shownPosts = allPosts ? posts : posts.slice(0, 3)
  const morePosts = !allPosts && (posts.length > 3 || totalPages > 1)

  return (
    <div className="pf-page space-y-3">
      {editing && editor ? (
        <>
          <div className="flex items-center justify-end gap-2">
            <Link href="/members/me?preview=1" className="text-[13px] text-link min-h-[36px] inline-flex items-center">
              <T>다른 사람에게 보이는 모습</T>
            </Link>
            <Link href="/members/me" className="btn btn-primary btn-sm min-h-[36px] rounded-full">
              <T>완료</T>
            </Link>
          </div>
          <ProfileCardEditor {...editor} settingsRows={false} />
        </>
      ) : (
        <section className="card pf-top" aria-labelledby="pf-name">
          <div className="pf-cover" aria-hidden />
          {owner && (
            <Link href={editHref()} className="pf-pencil pf-top-pencil" aria-label={st('프로필 편집')} title={st('프로필 편집')}>
              <Pencil className="w-4 h-4" />
            </Link>
          )}
          <div className="pf-top-body">
            <span className="pf-avatar">
              <UserAvatar id={member.id} name={member.display_name} avatarUrl={member.avatar_url} size="lg" />
            </span>
            <div className="pf-name-row">
              <h1 id="pf-name" className="pf-name">{member.display_name}</h1>
              {social && <RelationBadge relation={social.relation} />}
            </div>
            {member.bio ? (
              <p className="pf-headline">{member.bio}</p>
            ) : owner ? (
              <Link href={editHref()} className="pf-headline pf-headline-empty"><Plus className="w-3.5 h-3.5" /> <T>한 줄 소개 추가</T></Link>
            ) : null}
            <p className="pf-meta">
              {member.handle && <span>@{member.handle}</span>}
              {member.show_real_name && member.public_real_name && <span><T s="실명 {public_real_name}" vars={{ public_real_name: member.public_real_name }} /></span>}
              {inviter?.signup_completed_at && (
                <span>
                  <T s="{name}님의 초대" vars={{ name: <Link href={`/members/${inviter.id}`} className="pf-meta-link">{inviter.display_name}</Link> }} />
                </span>
              )}
              <span><T s="{date} 가입" vars={{ date: joined }} /></span>
            </p>
            {social && (
              <p className="pf-counts">
                <Link href={socialHref('followers')}><b>{social.followers}</b> <T>팔로워</T></Link>
                <Link href={socialHref('friends')}><b>{social.friends}</b> <T>친구</T></Link>
                <Link href={socialHref('following')}><b>{social.following}</b> <T>팔로잉</T></Link>
                <Link href={isMe ? networkHref() : networkHref({ root: member.id })} className="pf-counts-net"><Network className="w-3.5 h-3.5" /> <T>초대 네트워크</T></Link>
              </p>
            )}
            <div className="pf-actions">
              {!isMe && social && (
                <>
                  <FollowButton memberId={member.id} initialFollowing={social.relation.iFollow} />
                  <FriendButton memberId={member.id} initialState={social.relation.friend} />
                </>
              )}
              {owner && (
                <Link href={editHref()} className="btn btn-primary btn-sm min-h-[40px] rounded-full">
                  <Pencil className="w-4 h-4" /> <T>프로필 편집</T>
                </Link>
              )}
              {isMe && !owner && (
                <Link href="/members/me" className="btn btn-primary btn-sm min-h-[40px] rounded-full"><T>내 프로필로 돌아가기</T></Link>
              )}
              {owner && (social?.incomingRequests ?? 0) > 0 && (
                <Link href={socialHref('requests')} className="btn btn-secondary btn-sm min-h-[40px] rounded-full pf-requests">
                  <T s="친구 요청 {incomingRequests}" vars={{ incomingRequests: social!.incomingRequests }} />
                </Link>
              )}
              <ProfileShareButton path={`/members/${member.id}`} name={member.display_name} />
              {owner && (
                <Link href="/settings" className="btn btn-secondary btn-sm min-h-[40px] min-w-[40px] rounded-full !px-0 justify-center" aria-label={st('설정')} title={st('설정')}>
                  <Settings className="w-[18px] h-[18px]" />
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 소개: SNS links and badges (the bio is the headline above) — the editor has these while editing */}
      {!editing && (links.length > 0 || badges.length > 0 || owner) && (
        <ProfileSection id="about" title={<T>소개</T>} editHref={owner ? editHref() : null} editLabel={st('소개 편집')}>
          {links.length === 0 && badges.length === 0 ? (
            <ProfileEmpty text={<T>블로그, GitHub, X 같은 링크를 더해 보세요.</T>} href={editHref()} action={<T>링크 추가</T>} />
          ) : (
            <>
              {links.length > 0 && (
                <ul className="profile-links flex flex-wrap gap-1.5" aria-label={st('SNS 링크')}>
                  {links.map((l, i) => {
                    const label = LINK_KINDS.find((k) => k.kind === l.kind)?.label ?? l.kind
                    return (
                      <li key={i}>
                        <a href={l.url} target="_blank" rel="noopener noreferrer nofollow me" className="pf-link" title={l.url}>
                          <LinkIcon kind={l.kind} size={22} />
                          <T>{label}</T>
                          {owner && l.visibility !== 'members' && <span className="text-[11px] text-n-999">· <T>{LINK_VISIBILITY.find((v) => v.id === l.visibility)?.label ?? ''}</T></span>}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              )}
              {badges.length > 0 && (
                <div className={links.length > 0 ? 'mt-3' : ''}>
                  <BadgeChips badges={badges} isMe={isMe} initialOpen={openBadge} />
                </div>
              )}
            </>
          )}
        </ProfileSection>
      )}


      {(authored.articles.length > 0 || authored.series.length > 0 || owner) && (
        <ProfileSection id="articles" title={<T>아티클</T>} tools={authored.articles.length > 0 ? <span className="pf-section-note"><T s="{n}편" vars={{ n: authored.articles.length }} /></span> : null}>
          {authored.articles.length === 0 && authored.series.length === 0 ? (
            <ProfileEmpty text={<T>아직 발행한 아티클이 없어요.</T>} href="/articles/new" action={<T>새 아티클</T>} />
          ) : (
            <div className="space-y-4">
              {authored.series.length > 0 && (
                <div className="article-grid">
                  {authored.series.map((ser) => (
                    <SeriesCardView key={ser.id} series={ser} />
                  ))}
                </div>
              )}
              <div className="article-grid">
                {authored.articles.slice(0, 6).map((a) => (
                  <ArticleCardView key={a.id} article={a} compact />
                ))}
              </div>
            </div>
          )}
        </ProfileSection>
      )}

      {(posts.length > 0 || owner) && (
        <ProfileSection
          id="activity"
          title={<T>활동 내역</T>}
          tools={stats && owner ? <span className="pf-section-note"><T s="글 {posts} · 받은 좋아요 {likes}" vars={{ posts: stats.posts, likes: stats.likes }} /></span> : null}
        >
          {posts.length === 0 ? (
            <ProfileEmpty text={<T>아직 쓴 글이 없어요. 오늘 써 본 AI 이야기로 시작해 보세요.</T>} href="/posts/new" action={<T>첫 글 쓰기</T>} />
          ) : allPosts ? (
            <InfiniteList key={member.id} className="inf-cards" hasMore={totalPages > 1} load={more} storageKey={`/members/${member.id}?all=posts`}>
              <ProfilePosts posts={shownPosts} />
            </InfiniteList>
          ) : (
            <ProfilePosts posts={shownPosts} />
          )}
          {morePosts && (
            <Link href={`${base}?all=posts${sp.preview === '1' ? '&preview=1' : ''}#activity`} className="pf-more">
              <T>모두 보기</T> <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </ProfileSection>
      )}

      {(!usesEmpty || owner) && (
        <ProfileSection
          id="uses"
          title={isMe ? <T>내가 쓰는 것</T> : <T s="{name}님이 쓰는 것" vars={{ name: member.display_name }} />}
          icon={<Wrench className="w-4 h-4" />}
          editHref={owner && !editing ? editHref('#stack') : null}
          editLabel={st('내가 쓰는 것 편집')}
          tools={owner ? <UsageVisibility initial={usageVis} /> : null}
        >
          {usesEmpty ? (
            <ProfileEmpty text={<T>쓰는 AI, 구독 중인 서비스, 스킬·MCP를 더하면 비슷한 사람과 이어져요.</T>} href={editHref('#stack')} action={<T>추가</T>} />
          ) : (
            <div className="flex flex-col gap-3">
              {!editing && stack && stackGroups.map((g) => <StackChips key={g} group={g} data={stack[g]} max={40} />)}
              {otherTools.length > 0 && (
                <div className="mc-group">
                  <div className="mc-group-label"><T>갤러리 서비스·툴</T></div>
                  <MyToolsList
                    editable={owner}
                    tools={otherTools.map((t) => ({ id: t.id, name: t.name, iconUrl: t.icon_url ?? null, href: toolHref(t), typeLabel: TOOL_TYPE_CHIP[t.type], users: t.user_count ?? 0 }))}
                  />
                </div>
              )}
            </div>
          )}
        </ProfileSection>
      )}

      {(agents.length > 0 || owner) && <AgentsSection agents={agents} isMe={owner} ownerName={member.display_name} />}

      {(made.length > 0 || owner) && (
        <ProfileSection id="made" title={<T>갤러리·런칭</T>} icon={<Rocket className="w-4 h-4" />} count={made.length} tools={owner && made.length > 0 ? <Link href="/gallery/new" className="pf-section-link"><Plus className="w-3.5 h-3.5" /> <T>올리기</T></Link> : null}>
          {made.length === 0 ? (
            <ProfileEmpty text={<T>직접 만든 도구나 서비스가 있다면 갤러리에 올려 보세요.</T>} href="/gallery/new" action={<T>내 서비스 올리기</T>} />
          ) : (
            <ul className="pf-rows">
              {made.map((e) => (
                <li key={e.id}>
                  <Link href={toolHref(e)} className="pf-row">
                    <ToolIcon name={e.name} iconUrl={e.icon_url} dim="w-10 h-10" />
                    <span className="min-w-0">
                      <span className="pf-row-title">{e.name}</span>
                      <span className="pf-row-sub">{e.description}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ProfileSection>
      )}

      {(hosted.length > 0 || owner) && (
        <ProfileSection id="moim" title={<T>모임</T>} icon={<CalendarDays className="w-4 h-4" />}>
          {hosted.length === 0 ? (
            <ProfileEmpty text={<T>같이 이야기하고 싶은 주제가 있다면 모임을 열어 보세요.</T>} href="/moim/new" action={<T>모임 열기</T>} />
          ) : (
            <ul className="pf-rows">
              {hosted.map(({ moim: m, upcoming }) => (
                <li key={m.id}>
                  <Link href={`/moim/${m.id}`} className="pf-row">
                    <span className="pf-date" aria-hidden>
                      <b>{new Intl.DateTimeFormat(intl, { day: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date(m.startsAt)).replace(/\D+$/, '')}</b>
                      <span>{new Intl.DateTimeFormat(intl, { month: 'short', timeZone: 'Asia/Seoul' }).format(new Date(m.startsAt))}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="pf-row-title">{m.title}</span>
                      <span className="pf-row-sub">
                        {upcoming ? <T s="예정 · 호스트 · {n}명 참여" vars={{ n: m.confirmed }} /> : <T s="지난 모임 · 호스트 · {n}명 참여" vars={{ n: m.confirmed }} />}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ProfileSection>
      )}
    </div>
  )
}

function ProfilePosts({ posts }: { posts: Awaited<ReturnType<typeof listFeedPage>>['posts'] }) {
  return (
    <div className="timeline-list timeline-stream">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} href={`/posts/${p.id}`} replyHref={`/posts/${p.id}`} likeEndpoint={`/api/feed/${p.id}/like`} likersEndpoint={`/api/feed/${p.id}/likers`} />
      ))}
    </div>
  )
}
