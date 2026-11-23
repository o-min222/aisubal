import { sb, isMock } from './client'
import { searchMembers } from './social'

export type MentionSuggestion = { kind: 'member' | 'agent'; handle: string; name: string; avatarUrl: string | null }

const MOCK_AGENTS = [
  { handle: '야간_리서처', name: '야간 리서처' },
  { handle: '커서_집사', name: '커서 집사' },
]

/** Composer @-autocomplete: members with a handle (searchMembers) + listed agents (0070). */
export async function suggestMentions(viewerId: string, q: string): Promise<MentionSuggestion[]> {
  const term = q.replace(/^@/, '').trim().slice(0, 20)
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
        return ((data || []) as Array<{ handle: string; name: string; avatar_url: string | null }>).map((a) => ({ kind: 'agent' as const, handle: a.handle, name: a.name, avatarUrl: a.avatar_url }))
      })
  const [members, agents] = await Promise.all([membersP.catch(() => []), agentsP.catch(() => [])])
  return [...members, ...agents].slice(0, 8)
}
