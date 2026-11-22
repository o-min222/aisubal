/** Pure helpers for the right-rail recommendations (tested in tests/shell.test.ts). */

/** Most frequent tags across the member's archive / reviewed tools / liked posts. */
export function pickInterestTags(tagLists: Array<string[] | null | undefined>, limit = 8): string[] {
  const counts = new Map<string, number>()
  for (const list of tagLists) {
    for (const raw of list || []) {
      const t = raw.trim().toLowerCase()
      if (!t || t === '내글') continue
      counts.set(t, (counts.get(t) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([t]) => t)
}

export type RankableTool = {
  id: string
  tags: string[]
  mention_count: number
  install_count: number
  avg_rating: number
  rating_count: number
  featured: boolean
  user_count?: number | null
}

/**
 * Members who share tools with me ("co-usage") and tag overlap dominate; popularity
 * (incl. how many members use it) breaks ties; tools I already use are skipped.
 */
export function rankToolsForMember<T extends RankableTool>(
  entries: T[],
  interestTags: string[],
  exclude: Set<string>,
  limit = 3,
  coUse: Map<string, number> = new Map()
): Array<T & { matchedTag: string | null; coUsers: number }> {
  const interest = new Set(interestTags)
  return entries
    .filter((e) => !exclude.has(e.id))
    .map((e) => {
      const matched = e.tags.map((t) => t.toLowerCase()).filter((t) => interest.has(t))
      const coUsers = coUse.get(e.id) ?? 0
      const popularity =
        (e.user_count ?? 0) * 3 +
        e.mention_count * 2 +
        e.install_count +
        Number(e.avg_rating) * e.rating_count +
        (e.featured ? 3 : 0)
      return { e, score: coUsers * 1500 + matched.length * 1000 + popularity, matchedTag: matched[0] ?? null, coUsers }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ e, matchedTag, coUsers }) => ({ ...e, matchedTag, coUsers }))
}

/** One-line reason shown under a rail recommendation. */
export function toolReason(t: { coUsers: number; matchedTag: string | null; user_count?: number | null }): string | null {
  if (t.coUsers > 0) return `나와 같은 툴을 쓰는 ${t.coUsers}명이 사용 중`
  if (t.matchedTag) return `#${t.matchedTag} 관심사 기반`
  if ((t.user_count ?? 0) > 0) return `${t.user_count}명이 사용 중`
  return null
}
