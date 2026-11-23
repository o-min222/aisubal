/** '나도 써요' on gallery rows: who to show in the avatar stack, and how to say it. */
export type ToolStackUser = { id: string; name: string; avatarUrl: string | null; kind: 'friend' | 'following' | 'other' }
/** Up to 3 faces (friends → people I follow → others, me last) and how many friends / followings use it. */
export type ToolUsageStack = { stack: ToolStackUser[]; friends: number; following: number }

export const STACK_SIZE = 3

const RANK = { friend: 0, following: 1, other: 2 } as const

export function usageStacks(
  rows: Array<{ entry_id: string; member_id: string; name: string; avatarUrl: string | null }>,
  viewerId: string,
  friends: Set<string>,
  following: Set<string>,
): Map<string, ToolUsageStack> {
  const by = new Map<string, Array<ToolStackUser & { me: boolean; i: number }>>()
  rows.forEach((r, i) => {
    const list = by.get(r.entry_id) || []
    if (list.some((u) => u.id === r.member_id)) return
    const kind = friends.has(r.member_id) ? 'friend' : following.has(r.member_id) ? 'following' : 'other'
    list.push({ id: r.member_id, name: r.name, avatarUrl: r.avatarUrl, kind, me: r.member_id === viewerId, i })
    by.set(r.entry_id, list)
  })
  const out = new Map<string, ToolUsageStack>()
  for (const [entry, list] of by) {
    const others = list.filter((u) => !u.me)
    const ranked = [...others.sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.i - b.i), ...list.filter((u) => u.me)]
    out.set(entry, {
      stack: ranked.slice(0, STACK_SIZE).map(({ id, name, avatarUrl, kind }) => ({ id, name, avatarUrl, kind })),
      friends: others.filter((u) => u.kind === 'friend').length,
      following: others.filter((u) => u.kind === 'following').length,
    })
  }
  return out
}

/** The usage line next to the stack: friends first, then followings, else the total. */
export function usageLine(u: ToolUsageStack | undefined, total: number): { s: string; vars: Record<string, number> } | null {
  if (u?.friends) return { s: '친구 {n}명이 써요', vars: { n: u.friends } }
  if (u?.following) return { s: '팔로잉 {n}명이 써요', vars: { n: u.following } }
  return total > 0 ? { s: '{n}명이 써요', vars: { n: total } } : null
}
