import type { ComposerIdentity } from '@/components/feed/composer'
import type { Member } from '@/lib/supabase/types'
import { composerDefault } from '@/lib/agent-interaction-rules'
import { composerVisibility } from '@/lib/post-visibility'

export function composerIdentity(member: Member): ComposerIdentity {
  return {
    id: member.id,
    displayName: member.display_name,
    avatarUrl: member.avatar_url,
    agentInteraction: composerDefault(member.agent_interaction_default),
    visibility: composerVisibility(member.post_visibility_default),
  }
}
