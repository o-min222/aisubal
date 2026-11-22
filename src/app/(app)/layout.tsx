import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { getProfileStats, getRailData } from '@/lib/data/shell'
import type { Member } from '@/lib/supabase/types'
import { TopBar } from '@/components/shell/top-bar'
import { SideNav } from '@/components/shell/side-nav'
import { ProfileCard } from '@/components/shell/profile-card'
import { RightRail, RailSkeleton } from '@/components/shell/right-rail'
import { BottomTabs, ComposeFab } from '@/components/shell/bottom-tabs'
import type { ShellMember } from '@/components/shell/nav-items'

async function ProfileCardLoader({ member, me }: { member: Member; me: ShellMember }) {
  const stats = await getProfileStats(member).catch(() => null)
  return <ProfileCard me={me} stats={stats} />
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
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const member = state.member
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
      <div className="app-grid">
        <aside className="app-left">
          <div className="app-sticky">
            <Suspense fallback={<ProfileCard me={me} stats={null} />}>
              <ProfileCardLoader member={member} me={me} />
            </Suspense>
            <SideNav isAdmin={me.isAdmin} />
          </div>
        </aside>
        <main className="app-center" id="main">
          {children}
        </main>
        <aside className="app-right" aria-label="추천">
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
