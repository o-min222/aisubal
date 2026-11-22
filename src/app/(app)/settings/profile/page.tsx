import { redirect } from 'next/navigation'
import { getUserState, getNicknameUnlockState } from '@/lib/auth'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { ProfileSettings } from '../profile-settings'

export default async function ProfileSettingsPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member') redirect('/login')
  const unlock = await getNicknameUnlockState()
  // ?preview=locked — force locked nickname UI for review screenshots
  const forceLocked = (await searchParams).preview === 'locked'
  return (
    <>
      <SubPageHeader title="프로필 편집" description="실명 프로필이 기본이고, 별명 프로필은 커뮤니티가 커지면 열려요." />
      <ProfileSettings
        member={state.member}
        nicknameUnlocked={forceLocked ? false : unlock.unlocked}
        activeMemberCount={forceLocked ? 1 : unlock.activeCount}
        unlockThreshold={unlock.threshold}
      />
    </>
  )
}
