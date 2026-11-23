import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { getRailData } from '@/lib/data/shell'
import { getMemberCard } from '@/lib/data/member-card'
import { getPledgeStatus } from '@/lib/data/pledge'
import { recordVisit } from '@/lib/data/badges'
import type { Member } from '@/lib/supabase/types'
import { TopBar } from '@/components/shell/top-bar'
import { SideNav } from '@/components/shell/side-nav'
import { ProfileCard } from '@/components/shell/profile-card'
import { RightRail, RailSkeleton } from '@/components/shell/right-rail'
import { MyGroupsNav } from '@/components/shell/my-groups-nav'
import { listMyGroups } from '@/lib/data/groups'
import { BottomTabs, ComposeFab } from '@/components/shell/bottom-tabs'
import { PullToRefresh } from '@/components/shell/pull-to-refresh'
import { JustPosted } from '@/components/timeline/just-posted'
import type { ShellMember } from '@/components/shell/nav-items'
import { getT } from '@/i18n/server'

async function ProfileCardLoader({ member, me }: { member: Member; me: ShellMember }) {
  const card = await getMemberCard(member, member.id).catch(() => null)
  return <ProfileCard me={me} card={card} />
}

async function MyGroupsLoader({ memberId }: { memberId: string }) {
  const groups = await listMyGroups(memberId).catch(() => [])
  return <MyGroupsNav groups={groups.map((g) => ({ slug: g.slug, name: g.name, emoji: g.emoji, role: g.myRole }))} />
}

async function RailLoader({ member }: { member: Member }) {
  const data = await getRailData(member)
  return <RightRail data={data} />
}

/**
 * LinkedIn-style signed-in shell. The left panel and right rail persist across
 * navigations (layouts don't re-render), only the center column swaps.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const st = await getT()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const member = state.member
  // Self-made profile (handle + name + avatar) is required before entering; Google data is never the public identity.
  if (!member.profile_completed_at) redirect('/onboarding')
  // Signup is complete only after the 입단 서약 (existing members sign once too).
  // E1 streak badge: one visit row per Seoul day (a no-op after the first load of the day), alongside the pledge read.
  const [pledge] = await Promise.all([getPledgeStatus(member).catch(() => null), recordVisit().catch(() => undefined)])
  if (pledge && !pledge.signedAt) redirect('/pledge')
  // Only public-safe fields cross into client components (no email).
  const me: ShellMember = {
    id: member.id,
    displayName: member.display_name,
    avatarUrl: member.avatar_url,
    nickname: member.nickname,
    bio: member.bio,
    isAdmin: Boolean(member.is_admin),
  }

  return (
    <div className="app-root">
      <TopBar me={me} />
      <PullToRefresh />
      <div className="app-grid">
        <aside className="app-left">
          <div className="app-sticky">
            <Suspense fallback={<ProfileCard me={me} card={null} />}>
              <ProfileCardLoader member={member} me={me} />
            </Suspense>
            <SideNav isAdmin={me.isAdmin} />
            <Suspense fallback={null}>
              <MyGroupsLoader memberId={member.id} />
            </Suspense>
          </div>
        </aside>
        <main className="app-center" id="main">
          {children}
          <Suspense fallback={null}>
            <JustPosted />
          </Suspense>
        </main>
        <aside className="app-right" aria-label={st('추천')}>
          <div className="app-sticky">
            <Suspense fallback={<RailSkeleton />}>
              <RailLoader member={member} />
            </Suspense>
          </div>
        </aside>
      </div>
      <ComposeFab />
      <BottomTabs />
    </div>
  )
}
