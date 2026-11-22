import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CalendarPlus, ChevronLeft, Lock } from 'lucide-react'
import { getNicknameUnlockState, getUserState } from '@/lib/auth'
import { getGroupBySlug, listGroupMembers } from '@/lib/data/groups'
import { listFeedPage } from '@/lib/data/feed'
import { Pagination } from '@/components/pagination'
import { parsePage } from '@/lib/paging'
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
import { GroupForm } from '@/components/groups/group-form'
import { GroupRequests, MemberControls } from '@/components/groups/group-manage'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

type Tab = 'feed' | 'members' | 'moim' | 'requests' | 'settings'

export default async function GroupPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; page?: string }> }) {
  const st = await getT()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const me = state.member.id
  const { slug } = await params
  const g = await getGroupBySlug(me, slug)
  if (!g) notFound()

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
  const page = parsePage(sp.page)
  const tab: Tab = tabs.some((t) => t.id === raw) ? raw : 'feed'
  const base = `/groups/${g.slug}`

  const members = tab === 'members' || tab === 'requests' ? await listGroupMembers(me, g.id).catch(() => []) : []
  const active = members.filter((m) => m.status === 'active')
  const relations = tab === 'members' ? await getRelations(me, active.map((m) => m.id)).catch(() => new Map()) : new Map()

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <Link href="/groups" className="tap-target inline-flex items-center justify-center rounded-full hover:bg-[#f2f2f2]" aria-label={st('그룹 목록')}>
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <span className="text-sm text-[#666]"><T>그룹</T></span>
      </div>

      <header className="card p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex gap-3 min-w-0 flex-1">
          <span aria-hidden className="flex-shrink-0 flex items-center justify-center rounded-2xl text-[28px]" style={{ width: 60, height: 60, background: '#f3f0ff' }}>
            {g.emoji || '#'}
          </span>
          <div className="min-w-0">
            <h1 className="text-[20px] font-bold leading-tight" style={{ color: '#111' }}>
              {g.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[12.5px]" style={{ color: '#777' }}>
              <span><T s="멤버 {n}" vars={{ n: g.memberCount }} /></span>
              <GroupPolicy g={g} />
              {g.myRole && <span className="font-semibold text-[#111]"><T s="내 역할: {role}" vars={{ role: <T>{ROLE_LABEL[g.myRole]}</T> }} /></span>}
            </div>
            {g.description && (
              <p className="text-[13.5px] mt-1.5 whitespace-pre-wrap" style={{ color: '#444' }}>
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
          <GroupTimeline groupId={g.id} groupName={g.name} canPost={g.myStatus === 'active'} member={state.member} viewerId={me} page={page} base={base} />
        ) : (
          <div className="card p-8 text-center space-y-1">
            <Lock className="w-5 h-5 mx-auto text-[#999]" />
            <p className="text-[14px] font-semibold" style={{ color: '#111' }}>
              <T>멤버만 볼 수 있는 타임라인이에요</T>
            </p>
            <p className="text-[13px] text-[#777]">{g.myStatus === 'pending' ? <T>가입 요청을 보냈어요. 승인되면 보여요.</T> : <T>가입하면 그룹 글을 보고 쓸 수 있어요.</T>}</p>
          </div>
        ))}

      {tab === 'members' && (
        <section className="card divide-y divide-[#f0f0f0]" aria-label={st('멤버')}>
          {active.map((m) => (
            <PersonRow
              key={m.id}
              person={{ id: m.id, name: m.name, avatarUrl: m.avatarUrl, relation: relations.get(m.id) ?? relationFromRow({ is_me: m.id === me }) }}
              subtitle={m.role !== 'member' ? ROLE_LABEL[m.role] : undefined}
              extra={isMod ? <MemberControls groupId={g.id} member={m} myRole={g.myRole} isSelf={m.id === me} /> : undefined}
            />
          ))}
          {active.length === 0 && <p className="p-6 text-center text-[13px] text-[#888]"><T>멤버가 없어요.</T></p>}
        </section>
      )}

      {tab === 'moim' && <GroupMoim groupId={g.id} groupSlug={g.slug} isMod={isMod} viewerId={me} />}

      {tab === 'requests' && isMod && (
        <GroupRequests groupId={g.id} pending={members.filter((m) => m.status === 'pending')} invited={members.filter((m) => m.status === 'invited')} memberIds={active.map((m) => m.id)} />
      )}

      {tab === 'settings' && isOwner && <GroupForm edit={g} />}
    </div>
  )
}

async function GroupTimeline({ groupId, groupName, canPost, member, viewerId, page, base }: { groupId: string; groupName: string; canPost: boolean; member: Member; viewerId: string; page: number; base: string }) {
  const st = await getT()
  const [{ posts, totalPages }, unlock] = await Promise.all([
    listFeedPage(viewerId, { groupId, page }).catch(() => ({ posts: [], totalPages: 1 })),
    getNicknameUnlockState(),
  ])
  return (
    <>
      {canPost && page === 1 && <Composer me={{ ...composerIdentity(member, unlock.unlocked), nicknameAvailable: false }} groupId={groupId} groupName={groupName} />}
      <FeedTimeline initial={posts} emptyTitle={st('아직 그룹 글이 없어요')} emptyHint={canPost ? st('첫 글을 남겨보세요. 그룹 멤버에게만 보여요.') : st('가입하면 글을 쓸 수 있어요.')} />
      <Pagination base={base} page={page} totalPages={totalPages} label={msg('그룹 타임라인 페이지')} />
    </>
  )
}

/** Read-only links. 모임 are never created inside a group; managers create them on /moim/new with this group as host. */
async function GroupMoim({ groupId, groupSlug, isMod, viewerId }: { groupId: string; groupSlug: string; isMod: boolean; viewerId: string }) {
  const [upcoming, past] = await Promise.all([listMoim(viewerId, 'upcoming', groupId).catch(() => []), listMoim(viewerId, 'past', groupId, 10).catch(() => [])])
  return (
    <div className="space-y-2">
      {isMod && (
        <Link href={`/moim/new?group=${groupSlug}`} className="card p-3 flex items-center gap-2 text-[13.5px] font-semibold hover:bg-[#fafafa]" style={{ color: '#111' }}>
          <CalendarPlus className="w-4 h-4" /> <T>모임 페이지에서 이 그룹 이름으로 모임 열기</T>
        </Link>
      )}
      {upcoming.length === 0 && past.length === 0 && <div className="card p-6 text-center text-[13px] text-[#888]"><T>이 그룹의 모임이 아직 없어요.</T></div>}
      {upcoming.map((m) => (
        <MoimCard key={m.id} moim={m} showGroup={false} />
      ))}
      {past.length > 0 && (
        <>
          <h2 className="px-1 pt-2 text-[13px] font-semibold text-[#777]"><T>지난 모임</T></h2>
          {past.map((m) => (
            <MoimCard key={m.id} moim={m} showGroup={false} />
          ))}
        </>
      )}
    </div>
  )
}
