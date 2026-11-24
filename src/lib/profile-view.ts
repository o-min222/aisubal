/**
 * A91: profile view helpers (pure).
 * hostedMoim: moim a member hosts under their real name, upcoming first, then the most recent
 * past ones. A moim hosted as a 부캐 (nickname) never shows on the real profile: that would link
 * the nickname to the person.
 */
type HostedLike = { id: string; hostId: string | null; host: { kind: 'real' | 'nickname' } }

export function hostedMoim<M extends HostedLike>(upcoming: M[], past: M[], memberId: string, limit = 3): { moim: M; upcoming: boolean }[] {
  const mine = (m: M) => m.hostId === memberId && m.host.kind === 'real'
  const seen = new Set<string>()
  const out: { moim: M; upcoming: boolean }[] = []
  for (const [list, up] of [[upcoming, true], [past, false]] as const) {
    for (const m of list) {
      if (out.length >= limit) return out
      if (!mine(m) || seen.has(m.id)) continue
      seen.add(m.id)
      out.push({ moim: m, upcoming: up })
    }
  }
  return out
}
