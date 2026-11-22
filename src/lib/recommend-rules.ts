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
}

/** Tag overlap dominates; popularity breaks ties; tools already used are skipped. */
export function rankToolsForMember<T extends RankableTool>(
  entries: T[],
  interestTags: string[],
  exclude: Set<string>,
  limit = 3
): Array<T & { matchedTag: string | null }> {
  const interest = new Set(interestTags)
  return entries
    .filter((e) => !exclude.has(e.id))
    .map((e) => {
      const matched = e.tags.map((t) => t.toLowerCase()).filter((t) => interest.has(t))
      const popularity =
        e.mention_count * 2 + e.install_count + Number(e.avg_rating) * e.rating_count + (e.featured ? 3 : 0)
      return { e, score: matched.length * 1000 + popularity, matchedTag: matched[0] ?? null }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ e, matchedTag }) => ({ ...e, matchedTag }))
}
