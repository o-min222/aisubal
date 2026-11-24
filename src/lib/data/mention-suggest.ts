import { sb, isMock } from './client'
import { listSocial, searchMembers } from './social'
import { mockHandle } from '@/lib/mock-social'

export type MentionSuggestion = { kind: 'member' | 'agent'; handle: string; name: string; avatarUrl: string | null; brand?: string | null }

const MOCK_AGENTS = [
  { handle: '야간_리서처', name: '야간 리서처', brand: 'claude' },
  { handle: '커서_집사', name: '커서 집사', brand: 'cursor' },
]

/** Composer @-autocomplete: members with a handle (searchMembers) + listed agents (0070). */
export async function suggestMentions(viewerId: string, q: string): Promise<MentionSuggestion[]> {
  // a syllable still being composed (IME) can't match a name yet: drop trailing jamo
  const term = q.replace(/^@/, '').trim().replace(/[ㄱ-ㅎㅏ-ㅣ]+$/, '').slice(0, 20)
  if (!term && q.replace(/^@/, '').trim()) return [] // only jamo so far: nothing to search yet
  const membersP = term
    ? searchMembers(term, 6).then((rows) =>
        (rows as Array<{ id: string; name: string; handle?: string | null; avatarUrl: string | null }>)
          .filter((m) => m.id !== viewerId && m.handle)
          .map((m): MentionSuggestion => ({ kind: 'member', handle: m.handle as string, name: m.name, avatarUrl: m.avatarUrl }))
      )
    : Promise.resolve([] as MentionSuggestion[])
  const agentsP: Promise<MentionSuggestion[]> = isMock()
    ? Promise.resolve(
        MOCK_AGENTS.filter((a) => !term || a.handle.startsWith(term.toLowerCase()) || a.name.includes(term)).map((a) => ({ kind: 'agent' as const, ...a, avatarUrl: null }))
      )
    : sb().then(async (supabase) => {
        const { data } = await supabase.rpc('mention_agents_suggest', { p_q: term })
        return ((data || []) as Array<{ handle: string; name: string; avatar_url: string | null; brand: string | null }>).map((a) => ({ kind: 'agent' as const, handle: a.handle, name: a.name, avatarUrl: a.avatar_url, brand: a.brand ?? null }))
      })
  const [members, agents] = await Promise.all([membersP.catch(() => []), agentsP.catch(() => [])])
  return [...members, ...agents].slice(0, 8)
}

/**
 * A27: the people you're most likely to @ (friends, then following, then followers) plus the
 * listed agents, fetched once when a composer gets focus so typing filters instantly.
 */
export async function mentionCircle(viewerId: string): Promise<MentionSuggestion[]> {
  const lists = await Promise.all((['friends', 'following', 'followers'] as const).map((k) => listSocial(viewerId, viewerId, k, 0, 200).catch(() => [])))
  const seen = new Set<string>()
  const people = lists.flat().filter((p) => p.id !== viewerId && !seen.has(p.id) && Boolean(seen.add(p.id)))
  let handles = new Map<string, string>()
  if (isMock()) handles = new Map(people.map((p) => [p.id, mockHandle(p.id)]))
  else if (people.length) {
    const supabase = await sb()
    const { data } = await supabase.from('members').select('id, handle').in('id', people.map((p) => p.id))
    handles = new Map(((data || []) as Array<{ id: string; handle: string | null }>).filter((r) => r.handle).map((r) => [r.id, r.handle as string]))
  }
  const members = people
    .filter((p) => handles.has(p.id))
    .map((p): MentionSuggestion => ({ kind: 'member', handle: handles.get(p.id) as string, name: p.name, avatarUrl: p.avatarUrl }))
  const agents = (await suggestMentions(viewerId, '').catch(() => [])).filter((s) => s.kind === 'agent')
  return [...members, ...agents]
}
