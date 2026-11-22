import Link from 'next/link'
import { ArchiveButton } from '@/components/archive/archive-button'
import { notFound, redirect } from 'next/navigation'
import { CalendarPlus, ChevronLeft, Lock } from 'lucide-react'
import { getNicknameUnlockState, getUserState } from '@/lib/auth'
import { getGroupBySlug, listGroupMembers, resolveGroupSlug } from '@/lib/data/groups'
import { listFeedPage } from '@/lib/data/feed'
import { InfiniteList } from '@/components/infinite/infinite-list'
import { listMoim } from '@/lib/data/moim'
import { getRelations } from '@/lib/data/social'
import { composerIdentity } from '@/lib/composer-identity'
import type { Member } from '@/lib/supabase/types'
import { canModerate, canReadTimeline, ROLE_LABEL } from '@/lib/group-rules'
import { relationFromRow } from '@/lib/social-rules'
import { LinkTabs } from '@/components/link-tabs'
import { Composer } from '@/components/feed/composer'
import { FeedTimeline } from '@/components/feed/feed-timeline'
import { MoimCard } from '@/components/moim/moim-card'
import { PersonRow } from '@/components/social/person-row'
import { GroupPolicy } from '@/components/groups/group-card'
import { GroupJoinButton } from '@/components/groups/group-actions'
import { GroupSettingsForm } from '@/components/groups/group-form'
import { GroupRequests, MemberControls } from '@/components/groups/group-manage'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'
import { pageTitle } from '@/lib/page-title'
import { canonical } from '@/lib/canonical'
import { GroupAvatar } from '@/components/groups/group-avatar'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member') return pageTitle(null)
  // the viewer's own session: a hidden group's name never reaches non-members
  const g = await getGroupBySlug(state.member.id, decodeURIComponent((await params).slug)).catch(() => null)
  return { ...pageTitle(g?.name, (await getT())('페이지를 찾을 수 없어요 · AI쓰발')), ...canonical(g ? `/groups/${encodeURIComponent(g.slug)}` : null) }
}

type Tab = 'feed' | 'members' | 'moim' | 'requests' | 'settings'

export default async function GroupPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const st = await getT()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const me = state.member.id
  const { slug } = await params
  const g = await getGroupBySlug(me, slug)
  if (!g) {
    // 0060: an address the owner changed keeps working
    const moved = await resolveGroupSlug(slug).catch(() => null)
    if (moved && moved !== slug) {
      const qs = new URLSearchParams(Object.entries(await searchParams).filter((e): e is [string, string] => typeof e[1] === 'string')).toString()
      redirect(`/groups/${moved}${qs ? `?${qs}` : ''}`)
    }
    notFound()
  }

  const isMod = canModerate(g.myRole)
  const isOwner = g.myRole === 'owner'
  const readable = canReadTimeline(g, g.myStatus)
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'feed', label: msg('타임라인') },
    { id: 'members', label: st('멤버 {memberCount}', { memberCount: g.memberCount }) },
    { id: 'moim', label: msg('모임') },
    ...(isMod ? [{ id: 'requests' as Tab, label: st('요청') }] : []),
    ...(isOwner ? [{ id: 'settings' as Tab, label: st('설정') }] : []),
  ]
  const sp = await searchParams
  const raw = sp.tab as Tab
  const tab: Tab = tabs.some((t) => t.id === raw) ? raw : 'feed'
  const base = `/groups/${g.slug}`

  const members = tab === 'members' || tab === 'requests' ? await listGroupMembers(me, g.id).catch(() => []) : []
  const active = members.filter((m) => m.status === 'active')
  const relations = tab === 'members' ? await getRelations(me, active.map((m) => m.id)).catch(() => new Map()) : new Map()

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <Link href="/groups" className="tap-target inline-flex items-center justify-center rounded-full hover:bg-n-f2f2f2" aria-label={st('그룹 목록')}>
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <span className="text-sm text-n-666"><T>그룹</T></span>
      </div>

      <header className="card p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex gap-3 min-w-0 flex-1">
          <GroupAvatar name={g.name} size={60} />
          <div className="min-w-0">
            <div className="flex items-start gap-2">
              <h1 className="text-[20px] font-bold leading-tight min-w-0" style={{ color: 'var(--n-111)' }}>
                {g.name}
              </h1>
              <ArchiveButton kind="group" refId={g.slug} className="-mt-1.5" hint={{ title: g.name, excerpt: g.description ?? undefined, url: `/groups/${g.slug}` }} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[12.5px]" style={{ color: 'var(--n-777)' }}>
              <span><T s="멤버 {n}" vars={{ n: g.memberCount }} /></span>
              <GroupPolicy g={g} />
              {g.myRole && <span className="font-semibold text-n-111"><T s="내 역할: {role}" vars={{ role: <T>{ROLE_LABEL[g.myRole]}</T> }} /></span>}
            </div>
            {g.description && (
              <p className="text-[13.5px] mt-1.5 whitespace-pre-wrap" style={{ color: 'var(--n-444)' }}>
                {g.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex-shrink-0">
          <GroupJoinButton g={g} />
        </div>
      </header>

      <div className="card" style={{ padding: '0 8px' }}>
        <LinkTabs label={msg('그룹 메뉴')} active={tab} tabs={tabs.map((t) => ({ id: t.id, label: t.label, href: t.id === 'feed' ? base : `${base}?tab=${t.id}` }))} />
      </div>

      {tab === 'feed' &&
        (readable ? (
          <GroupTimeline groupId={g.id} groupName={g.name} canPost={g.myStatus === 'active'} member={state.member} viewerId={me} base={base} />
        ) : (
          <div className="card p-8 text-center space-y-1">
            <Lock className="w-5 h-5 mx-auto text-n-999" />
            <p className="text-[14px] font-semibold" style={{ color: 'var(--n-111)' }}>
              <T>멤버만 볼 수 있는 타임라인이에요</T>
            </p>
            <p className="text-[13px] text-n-777">{g.myStatus === 'pending' ? <T>가입 요청을 보냈어요. 승인되면 보여요.</T> : <T>가입하면 그룹 글을 보고 쓸 수 있어요.</T>}</p>
          </div>
        ))}

      {tab === 'members' && (
        <section className="card divide-y divide-n-f0f0f0" aria-label={st('멤버')}>
          {active.map((m) => (
            <PersonRow
              key={m.id}
              person={{ id: m.id, name: m.name, avatarUrl: m.avatarUrl, relation: relations.get(m.id) ?? relationFromRow({ is_me: m.id === me }) }}
              subtitle={m.role !== 'member' ? ROLE_LABEL[m.role] : undefined}
              extra={isMod ? <MemberControls groupId={g.id} member={m} myRole={g.myRole} isSelf={m.id === me} /> : undefined}
            />
          ))}
          {active.length === 0 && <p className="p-6 text-center text-[13px] text-n-888"><T>멤버가 없어요.</T></p>}
        </section>
      )}

      {tab === 'moim' && <GroupMoim groupId={g.id} groupSlug={g.slug} isMod={isMod} viewerId={me} />}

      {tab === 'requests' && isMod && (
        <GroupRequests groupId={g.id} pending={members.filter((m) => m.status === 'pending')} invited={members.filter((m) => m.status === 'invited')} memberIds={active.map((m) => m.id)} />
      )}

      {tab === 'settings' && isOwner && <GroupSettingsForm group={g} />}
    </div>
  )
}

async function GroupTimeline({ groupId, groupName, canPost, member, viewerId, base }: { groupId: string; groupName: string; canPost: boolean; member: Member; viewerId: string; base: string }) {
  const st = await getT()
  const [{ posts, totalPages }, unlock] = await Promise.all([
    listFeedPage(viewerId, { groupId, page: 1 }).catch(() => ({ posts: [], totalPages: 1 })),
    getNicknameUnlockState(),
  ])
  async function more(page: number) {
    'use server'
    const s = await getUserState()
    if (s.type !== 'member') return { nodes: null, hasMore: false }
    const r = await listFeedPage(s.member.id, { groupId, page }).catch(() => ({ posts: [], totalPages: 1 }))
    return { nodes: r.posts.length ? <FeedTimeline initial={r.posts} /> : null, hasMore: page < r.totalPages }
  }
  return (
    <>
      {canPost && <Composer me={{ ...composerIdentity(member, unlock.unlocked), nicknameAvailable: false }} groupId={groupId} groupName={groupName} />}
      {posts.length === 0 ? (
        <FeedTimeline initial={posts} emptyTitle={st('아직 그룹 글이 없어요')} emptyHint={canPost ? st('첫 글을 남겨보세요. 그룹 멤버에게만 보여요.') : st('가입하면 글을 쓸 수 있어요.')} />
      ) : (
        <InfiniteList key={base} className="inf-cards" hasMore={totalPages > 1} load={more} storageKey={base}>
          <FeedTimeline initial={posts} />
        </InfiniteList>
      )}
    </>
  )
}

/** Read-only links. 모임 are never created inside a group; managers create them on /moim/new with this group as host. */
async function GroupMoim({ groupId, groupSlug, isMod, viewerId }: { groupId: string; groupSlug: string; isMod: boolean; viewerId: string }) {
  const [upcoming, past] = await Promise.all([listMoim(viewerId, 'upcoming', groupId).catch(() => []), listMoim(viewerId, 'past', groupId, 10).catch(() => [])])
  return (
    <div className="space-y-2">
      {isMod && (
        <Link href={`/moim/new?group=${groupSlug}`} className="card p-3 flex items-center gap-2 text-[13.5px] font-semibold hover:bg-n-fafafa" style={{ color: 'var(--n-111)' }}>
          <CalendarPlus className="w-4 h-4" /> <T>모임 페이지에서 이 그룹 이름으로 모임 열기</T>
        </Link>
      )}
      {upcoming.length === 0 && past.length === 0 && <div className="card p-6 text-center text-[13px] text-n-888"><T>이 그룹의 모임이 아직 없어요.</T></div>}
      {upcoming.map((m) => (
        <MoimCard key={m.id} moim={m} showGroup={false} />
      ))}
      {past.length > 0 && (
        <>
          <h2 className="px-1 pt-2 text-[13px] font-semibold text-n-777"><T>지난 모임</T></h2>
          {past.map((m) => (
            <MoimCard key={m.id} moim={m} showGroup={false} />
          ))}
        </>
      )}
    </div>
  )
}
