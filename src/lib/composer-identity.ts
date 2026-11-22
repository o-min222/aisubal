import type { ComposerIdentity } from '@/components/feed/composer'
import { memberHasNicknameProfile } from '@/lib/profile'
import type { Member } from '@/lib/supabase/types'

export function composerIdentity(member: Member, nicknameUnlocked: boolean): ComposerIdentity {
  return {
    id: member.id,
    displayName: member.display_name,
    avatarUrl: member.avatar_url,
    nickname: member.nickname,
    nicknameAvatarUrl: member.nickname_avatar_url,
    nicknameAvailable: nicknameUnlocked && memberHasNicknameProfile(member),
  }
}
