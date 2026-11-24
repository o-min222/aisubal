import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { getMemberById } from '@/lib/data/members'
import { getSocialSummary, listSocial, type SocialListKind } from '@/lib/data/social'
import { isFeedId } from '@/lib/feed-ids'
import { LinkTabs } from '@/components/link-tabs'
import { PersonRow } from '@/components/social/person-row'
import { SocialManager } from '@/components/social/social-manager'
import { parseManageTab, type ManageTab } from '@/lib/social-manage'
import type { SocialPerson } from '@/lib/data/social'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'
import { msg } from '@/i18n/translate'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('팔로워 · 팔로잉 · 친구 · AI쓰발') }
}

const EMPTY: Record<SocialListKind, string> = {
  followers: msg('아직 팔로워가 없어요.'),
  following: msg('아직 팔로우한 사람이 없어요.'),
  friends: msg('아직 친구가 없어요. 친구는 친구 신청 → 수락으로 생겨요 (맞팔과 별개).'),
  requests: msg('받은 친구 요청이 없어요.'),
  sent: msg('보낸 친구 요청이 없어요.'),
}

export default async function SocialListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
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
  if (!member) notFound()

  if (isMe) {
    // A48: own list = 친구·팔로워 관리 (all tabs in one load; a handful of people at this size)
    const LIM = 100
    const kinds: SocialListKind[] = ['friends', 'followers', 'following', 'requests', 'sent']
    const [lists, summary] = await Promise.all([
      Promise.all(kinds.map((k) => listSocial(viewer.id, viewer.id, k, 0, LIM).catch(() => [] as SocialPerson[]))),
      getSocialSummary(viewer.id, viewer.id).catch(() => null),
    ])
    const byId = new Map<string, SocialPerson>()
    for (const l of lists) for (const p of l) if (!byId.has(p.id)) byId.set(p.id, p)
    const over = (i: number, total: number | undefined) => (lists[i].length >= LIM && total ? Math.max(0, total - lists[i].length) : 0)
    const overflow: Partial<Record<ManageTab, number>> = { friends: over(0, summary?.friends), followers: over(1, summary?.followers), following: over(2, summary?.following) }
    const ids = (i: number) => lists[i].map((p) => p.id)
    const order: Partial<Record<ManageTab, string[]>> = { friends: ids(0), followers: ids(1), following: ids(2), requests: [...ids(3), ...ids(4)] }
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-1">
          <Link href="/members/me" className="tap-target inline-flex items-center justify-center rounded-full icon-btn" aria-label={st('프로필로')}>
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold" style={{ color: 'var(--n-111)' }}>
            <T>친구·팔로워 관리</T>
          </h1>
        </div>
        <SocialManager people={[...byId.values()]} order={order} initialTab={parseManageTab((await searchParams).tab)} overflow={overflow} />
      </div>
    )
  }

  const allowed: SocialListKind[] = isMe ? ['followers', 'following', 'friends', 'requests', 'sent'] : ['followers', 'following', 'friends']
  const raw = (await searchParams).tab as SocialListKind
  const tab: SocialListKind = allowed.includes(raw) ? raw : 'followers'
  const [people, summary] = await Promise.all([listSocial(viewer.id, member.id, tab).catch(() => []), getSocialSummary(viewer.id, member.id).catch(() => null)])
  const base = `/members/${isMe ? 'me' : member.id}/social?tab=`
  const labels: Record<SocialListKind, string> = { followers: st('팔로워'), following: st('팔로잉'), friends: st('친구'), requests: st('받은 요청'), sent: st('보낸 요청') }
  const counts: Partial<Record<SocialListKind, number | null>> = {
    followers: summary?.followers ?? null,
    following: summary?.following ?? null,
    friends: summary?.friends ?? null,
    requests: summary?.incomingRequests ?? null,
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <Link href={`/members/${isMe ? 'me' : member.id}`} className="tap-target inline-flex items-center justify-center rounded-full icon-btn" aria-label={st('프로필로')}>
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold" style={{ color: 'var(--n-111)' }}>
          {member.display_name}
        </h1>
      </div>
      <section className="card overflow-hidden">
        <div style={{ padding: '0 8px' }}>
          <LinkTabs
            label={msg('관계 목록')}
            active={tab}
            tabs={allowed.map((k) => ({ id: k, label: labels[k], href: base + k, count: counts[k] ?? null, dot: k === 'requests' && (summary?.incomingRequests ?? 0) > 0 }))}
          />
        </div>
        {tab === 'friends' || tab === 'requests' ? (
          <p className="text-xs px-4 pt-3" style={{ color: 'var(--n-888)' }}>
            <T>친구는 서로 수락한 관계예요. 서로 팔로우하는 ‘맞팔’과는 따로예요.</T>
          </p>
        ) : null}
        {people.length === 0 ? (
          <p className="p-8 text-center text-sm" style={{ color: 'var(--n-888)' }}>
            {EMPTY[tab]}
          </p>
        ) : (
          <ul className="divide-y divide-n-f0f0f0">
            {people.map((p) => (
              <li key={p.id}>
                <PersonRow person={p} showFriend={tab === 'requests' || tab === 'sent' || tab === 'friends'} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
