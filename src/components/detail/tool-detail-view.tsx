import { Bot, ShieldCheck } from 'lucide-react'
import { getNicknameUnlockState } from '@/lib/auth'
import { composerIdentity } from '@/lib/composer-identity'
import { toolHref } from '@/lib/tool-rules'
import { getToolboxEntry } from '@/lib/data/toolbox'
import { getPost } from '@/lib/data/posts'
import { getToolboxAiRating } from '@/lib/data/agora'
import { getProductDetails } from '@/lib/data/products'
import { getMockLaunchEntry, getToolUsers } from '@/lib/data/tools'
import { getToolProvenance } from '@/lib/data/tool-submissions'
import type { ToolboxEntryDetails } from '@/lib/data/types'
import type { Member } from '@/lib/supabase/types'
import { compatSummary } from '@/lib/toolbox-rules'
import { ToolUsersCard } from '@/components/tools/tool-users'
import { LaunchSection } from '@/components/tools/launch-section'
import { RelativeTime } from '@/components/relative-time'
import { ToolboxDetailClient } from '@/app/(app)/tools/[id]/toolbox-detail-client'

export async function loadToolEntry(id: string): Promise<ToolboxEntryDetails | null> {
  const entry = await getToolboxEntry(id)
  if (entry) return entry
  const launch = await getMockLaunchEntry(id) // DEV only: launches live in the mock product store
  return launch ? { ...launch, mentions: [], reviews: [], compat: compatSummary([], launch.id) } : null
}

/** Tool detail. Used by /tools/[id] and the 툴 reading pane. */
export async function ToolDetailView({ entry, member, variant = 'page' }: { entry: ToolboxEntryDetails; member: Member; variant?: 'page' | 'pane' }) {
  const [mentionPostsRaw, aiRating, usage, launch, unlock, prov] = await Promise.all([
    Promise.all(
      entry.mentions.map(async (m) => {
        const post = await getPost(m.post_id)
        if (!post) return null
        return { id: post.id, title: post.title, created_at: post.created_at, url: m.url }
      })
    ),
    getToolboxAiRating(entry.id, member.id).catch(() => ({ avg: 0, count: 0, latest: [] })),
    getToolUsers(entry.id, member.id).catch(() => ({ count: entry.user_count ?? 0, users: [], usedByMe: false })),
    entry.product_id ? getProductDetails(entry.product_id, member.id).catch(() => null) : Promise.resolve(null),
    getNicknameUnlockState(),
    getToolProvenance(entry.id).catch(() => null),
  ])
  const toolUrl = `https://aisubal.vercel.app${toolHref(entry)}`
  const mentionPosts = mentionPostsRaw.filter((x): x is NonNullable<typeof x> => Boolean(x))
  return (
    <ToolboxDetailClient
      entry={entry}
      mentionPosts={mentionPosts}
      member={member}
      aiRating={aiRating}
      variant={variant}
      provenanceSlot={
        prov ? (
          <section className="card p-4 text-[13px] space-y-1" aria-label="등록 이력" style={{ color: '#555' }}>
            <p className="flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5" /> 등록 요청 <b style={{ color: '#111' }}>{prov.submittedBy}</b> · <RelativeTime date={prov.submittedAt} />
            </p>
            {prov.approvedBy && prov.approvedAt && (
              <p className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" style={{ color: '#1f7a4d' }} /> 검토·승인 <b style={{ color: '#111' }}>{prov.approvedBy}</b> · <RelativeTime date={prov.approvedAt} />
              </p>
            )}
          </section>
        ) : null
      }
      usersSlot={
        <ToolUsersCard
          entryId={entry.id}
          usage={usage}
          tool={{ name: entry.name, url: toolUrl }}
          me={{ ...composerIdentity(member, unlock.unlocked), nicknameAvailable: false }}
        />
      }
      launchSlot={launch ? <LaunchSection product={launch} /> : null}
    />
  )
}
