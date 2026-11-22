import { redirect } from 'next/navigation'
import { getUserState, getNicknameUnlockState } from '@/lib/auth'
import { getProfileLinks } from '@/lib/data/profile'
import { memberHasNicknameProfile } from '@/lib/profile'
import { toProfileFormMember } from '@/lib/profile-form-member'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { ProfileSettings } from '../profile-settings'

export default async function ProfileSettingsPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member') redirect('/login')
  const m = state.member
  const [unlock, links] = await Promise.all([getNicknameUnlockState(), getProfileLinks(m.id, m.id).catch(() => [])])
  // ?preview=locked — force locked nickname UI for review screenshots
  const forceLocked = (await searchParams).preview === 'locked'
  return (
    <>
      <SubPageHeader title="프로필 편집" description="직접 만든 닉네임·@핸들·아바타가 어디서나 내 이름이에요. 실명·이메일은 기본 비공개." />
      <ProfileSettings
        me={toProfileFormMember(m)}
        nick={{ id: m.id, nickname: m.nickname, nicknameBio: m.nickname_bio, nicknameAvatarUrl: m.nickname_avatar_url, hasNick: memberHasNicknameProfile(m) }}
        links={links}
        nicknameUnlocked={forceLocked ? false : unlock.unlocked}
        activeMemberCount={forceLocked ? 1 : unlock.activeCount}
        unlockThreshold={unlock.threshold}
      />
    </>
  )
}
