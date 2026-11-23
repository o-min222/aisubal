import { msg } from '@/i18n/translate'

/** A43 (0095): who can see a root post; replies follow their root. */
export const POST_VISIBILITIES = ['members', 'followers', 'friends', 'private'] as const
export type PostVisibility = (typeof POST_VISIBILITIES)[number]

export const POST_VISIBILITY_OPTION: Record<PostVisibility, { title: string; desc: string }> = {
  members: { title: msg('전체 회원'), desc: msg('로그인한 회원 모두') },
  followers: { title: msg('팔로워'), desc: msg('나를 팔로우하는 사람과 친구') },
  friends: { title: msg('친구만'), desc: msg('서로 친구인 사람만') },
  private: { title: msg('나만 보기'), desc: msg('나에게만 보여요') },
}

export function parseVisibility(v: unknown): PostVisibility | null {
  return typeof v === 'string' && (POST_VISIBILITIES as readonly string[]).includes(v) ? (v as PostVisibility) : null
}

/** only plain real-name root posts outside groups can be restricted (DB: posts_visibility_kind_chk) */
export function canRestrict(o: { isReply: boolean; groupId?: string | null; asGroup?: boolean; postedAs?: string }): boolean {
  return !o.isReply && !o.groupId && !o.asGroup && (o.postedAs ?? 'real') === 'real'
}

/** the composer's starting value: the member's last choice */
export function composerVisibility(saved: string | null | undefined): PostVisibility {
  return parseVisibility(saved) ?? 'members'
}
