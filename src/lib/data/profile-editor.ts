import type { Member } from '@/lib/supabase/types'
import { getProfileLinks } from './profile'
import { getProfileStack } from './profile-stack'
import { listMemberTools } from './tools'
import { listProfileAgents } from './tokens'
import { SKILL_TYPES } from '@/lib/profile-stack'
import { toProfileFormMember } from '@/lib/profile-form-member'

/** Everything the inline profile-card editor needs (내 대시보드 and 설정 › 프로필). */
export async function loadProfileEditor(m: Member) {
  const [links, stack, tools, connected] = await Promise.all([
    getProfileLinks(m.id, m.id).catch(() => []),
    getProfileStack(m.id, m.id).catch(() => null),
    listMemberTools(m.id).catch(() => []),
    listProfileAgents(m.id, m.id).catch(() => []),
  ])
  const items = (g: 'ai' | 'subs') =>
    (stack?.[g]?.items ?? []).map((i) => ({ label: i.label, entryId: i.entry?.id ?? null, iconUrl: i.entry?.iconUrl ?? null, slug: i.entry?.slug, visibility: i.visibility ?? null }))
  return {
    me: toProfileFormMember(m),
    links,
    stack: {
      ai: items('ai'),
      subs: items('subs'),
      usedSkills: tools.filter((t) => SKILL_TYPES.includes(t.type)).map((t) => ({ label: t.name, entryId: t.id, iconUrl: t.icon_url, slug: t.slug })),
      skillExtras: stack?.skillExtras ?? [],
      vis: { ai: stack?.ai?.visibility ?? 'members', subs: stack?.subs?.visibility ?? 'members', skills: stack?.skills?.visibility ?? 'members' },
    },
    agents: connected.filter((c) => c.showOnProfile).map((c) => ({ id: c.id, name: c.agentName, client: c.client ?? null })),
  }
}
