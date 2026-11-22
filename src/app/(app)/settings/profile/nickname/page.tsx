import { redirect } from 'next/navigation'
import { getUserState, getNicknameUnlockState } from '@/lib/auth'
import { memberHasNicknameProfile } from '@/lib/profile'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { NicknameSettings } from '../../profile-settings'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('부캐 프로필 · AI쓰발') }
}

export default async function NicknameSettingsPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member') redirect('/login')
  const m = state.member
  const unlock = await getNicknameUnlockState()
  // ?preview=locked — force locked nickname UI for review screenshots
  const forceLocked = (await searchParams).preview === 'locked'
  return (
    <>
      <SubPageHeader title={msg('부캐(별명) 프로필')} description={msg('기본 프로필과 연결되지 않는 두 번째 이름. 열리면 글마다 고를 수 있어요.')} />
      <NicknameSettings
        nick={{ id: m.id, nickname: m.nickname, nicknameBio: m.nickname_bio, nicknameAvatarUrl: m.nickname_avatar_url, hasNick: memberHasNicknameProfile(m) }}
        nicknameUnlocked={forceLocked ? false : unlock.unlocked}
        activeMemberCount={forceLocked ? 1 : unlock.activeCount}
        unlockThreshold={unlock.threshold}
      />
    </>
  )
}
