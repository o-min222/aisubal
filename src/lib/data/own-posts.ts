/**
 * 0052: clients can't read posts.author_id. "My posts" = my real-name rows (public_author_id)
 * plus my 부캐 rows (nickname_id = my own nickname_profiles.id, known only to me).
 */
export function ownPostsFilter(memberId: string, nicknameId?: string | null): string {
  return nicknameId ? `public_author_id.eq.${memberId},nickname_id.eq.${nicknameId}` : `public_author_id.eq.${memberId}`
}
