import type { Member } from '@/lib/supabase/types'
import type { ProfileFormMember } from '@/components/profile/profile-form'

/** Placeholder names given by the signup trigger / 0010 backfill (never a real name). */
export function isPlaceholderName(name: string): boolean {
  return name === '새 멤버' || /^멤버[0-9a-f]{4}$/.test(name)
}

/** Owner-only shape for the profile form (private prefill included, email excluded). */
export function toProfileFormMember(m: Member): ProfileFormMember {
  return {
    id: m.id,
    handle: m.handle ?? null,
    displayName: m.display_name,
    bio: m.bio,
    avatarUrl: m.avatar_url,
    showRealName: Boolean(m.show_real_name),
    privateRealName: m.private_real_name ?? null,
    googleAvatarUrl: m.private_google_avatar_url ?? null,
    isPlaceholderName: isPlaceholderName(m.display_name),
  }
}
